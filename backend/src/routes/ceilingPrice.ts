import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { calcPositions } from '../services/portfolio'
import { fetchQuotes } from '../services/quotes'

// ─── CDI atual (último mês disponível) ───────────────────────────────────────
const BCB_FMT = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

async function fetchCurrentCdiAnnual(): Promise<number> {
  try {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 40) // últimos 40 dias para garantir dados
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${BCB_FMT(from)}&dataFinal=${BCB_FMT(to)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return 11.75
    const data = await res.json() as { data: string; valor: string }[]
    if (!data.length) return 11.75
    // Compõe os últimos ~21 dias úteis para estimar taxa mensal → anualiza
    let compound = 1
    for (const item of data.slice(-21)) {
      const daily = Number(item.valor.replace(',', '.')) / 100
      compound *= (1 + daily)
    }
    const monthly = compound - 1
    const annual = (Math.pow(1 + monthly, 12) - 1) * 100
    return Math.round(annual * 100) / 100
  } catch {
    return 11.75 // fallback
  }
}

// ─── Fundamentais via brapi.dev ───────────────────────────────────────────────
interface Fundamentals {
  lpa: number | null   // Lucro Por Ação (EPS)
  vpa: number | null   // Valor Patrimonial Por Ação (Book Value per Share)
}

async function fetchFundamentals(ticker: string, token: string): Promise<Fundamentals> {
  try {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics&token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { lpa: null, vpa: null }
    const data = await res.json() as {
      results?: {
        earningsPerShare?: number | null        // LPA — campo top-level
        defaultKeyStatistics?: {
          bookValue?: number | null             // VPA — dentro de defaultKeyStatistics
          earningsPerShare?: number | null      // LPA alternativo
        }
      }[]
    }
    const r = data.results?.[0]
    if (!r) return { lpa: null, vpa: null }

    const lpa = r.earningsPerShare ?? r.defaultKeyStatistics?.earningsPerShare ?? null
    const vpa = r.defaultKeyStatistics?.bookValue ?? null

    return {
      lpa: typeof lpa === 'number' && isFinite(lpa) && lpa > 0 ? lpa : null,
      vpa: typeof vpa === 'number' && isFinite(vpa) && vpa > 0 ? vpa : null,
    }
  } catch {
    return { lpa: null, vpa: null }
  }
}

// ─── Tipos de resposta ────────────────────────────────────────────────────────
interface FormulaResult {
  value: number | null   // preço teto calculado
  upside: number | null  // (value/currentPrice - 1) * 100
  valid: boolean         // dados suficientes para calcular
  na: boolean            // não aplicável para este tipo de ativo
}

interface CeilingPriceAsset {
  ticker: string
  assetClass: string
  name: string
  currentPrice: number
  dpa: number | null       // Dividendo Por Ação (12m)
  lpa: number | null       // Lucro Por Ação
  vpa: number | null       // Valor Patrimonial Por Ação
  formulas: {
    bazin: FormulaResult
    graham: FormulaResult
    lynch: FormulaResult
    gordon: FormulaResult
  }
  average: number | null   // média dos modelos válidos e aplicáveis
  signal: 'BARATO' | 'NEUTRO' | 'CARO' | 'SEM_DADOS'
}

// ─── Cálculos das fórmulas ────────────────────────────────────────────────────
function calcUpside(value: number | null, currentPrice: number): number | null {
  if (value === null || currentPrice <= 0) return null
  return Math.round(((value / currentPrice) - 1) * 10000) / 100
}

function calcBazin(dpa: number | null, currentPrice: number, bazinYield: number): FormulaResult {
  if (dpa === null || dpa <= 0) return { value: null, upside: null, valid: false, na: false }
  const value = Math.round((dpa / (bazinYield / 100)) * 100) / 100
  return { value, upside: calcUpside(value, currentPrice), valid: true, na: false }
}

function calcGraham(lpa: number | null, vpa: number | null, currentPrice: number, isStock: boolean): FormulaResult {
  if (!isStock) return { value: null, upside: null, valid: false, na: true }
  if (lpa === null || vpa === null || lpa <= 0 || vpa <= 0) return { value: null, upside: null, valid: false, na: false }
  const raw = Math.sqrt(22.5 * lpa * vpa)
  const value = Math.round(raw * 100) / 100
  return { value, upside: calcUpside(value, currentPrice), valid: true, na: false }
}

function calcLynch(lpa: number | null, currentPrice: number, growthPct: number, isStock: boolean): FormulaResult {
  if (!isStock) return { value: null, upside: null, valid: false, na: true }
  if (lpa === null || lpa <= 0) return { value: null, upside: null, valid: false, na: false }
  const value = Math.round(lpa * growthPct * 100) / 100
  return { value, upside: calcUpside(value, currentPrice), valid: true, na: false }
}

function calcGordon(dpa: number | null, currentPrice: number, ke: number, g: number): FormulaResult {
  if (dpa === null || dpa <= 0) return { value: null, upside: null, valid: false, na: false }
  const keDecimal = ke / 100
  const gDecimal = g / 100
  if (keDecimal <= gDecimal) return { value: null, upside: null, valid: false, na: false } // ke deve ser > g
  const value = Math.round((dpa * (1 + gDecimal)) / (keDecimal - gDecimal) * 100) / 100
  return { value, upside: calcUpside(value, currentPrice), valid: true, na: false }
}

function calcSignal(
  currentPrice: number,
  formulas: CeilingPriceAsset['formulas'],
): { average: number | null; signal: CeilingPriceAsset['signal'] } {
  const values = [formulas.bazin, formulas.graham, formulas.lynch, formulas.gordon]
    .filter(f => f.valid && !f.na && f.value !== null)
    .map(f => f.value as number)

  if (values.length === 0) return { average: null, signal: 'SEM_DADOS' }

  const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100

  let signal: CeilingPriceAsset['signal']
  const ratio = currentPrice / average
  if (ratio <= 1.0) signal = 'BARATO'
  else if (ratio <= 1.10) signal = 'NEUTRO'
  else signal = 'CARO'

  return { average, signal }
}

// ─── Rota ─────────────────────────────────────────────────────────────────────
export async function ceilingPriceRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/ceiling-price', async (req) => {
    const { walletId } = req.params as { walletId: string }
    const {
      assetClass: filterClass,
      ke: keParam,
      g: gParam,
      bazinYield: bazinYieldParam,
      lynchGrowth: lynchGrowthParam,
    } = req.query as {
      assetClass?: string
      ke?: string
      g?: string
      bazinYield?: string
      lynchGrowth?: string
    }

    // Parâmetros configuráveis (com defaults)
    const cdiAnnual = await fetchCurrentCdiAnnual()
    const bazinYield = Number(bazinYieldParam ?? 6)           // % (padrão 6%)
    const g = Number(gParam ?? 3)                              // % crescimento Gordon
    const ke = Number(keParam ?? (cdiAnnual + 3).toFixed(2))  // % retorno exigido
    const lynchGrowth = Number(lynchGrowthParam ?? 7)         // % crescimento Lynch

    const [transactions, dividends] = await Promise.all([
      prisma.transaction.findMany({
        where: { walletId },
        include: { asset: true },
        orderBy: { date: 'asc' },
      }),
      prisma.dividend.findMany({
        where: { walletId },
        include: { asset: true },
      }),
    ])

    const positions = calcPositions(transactions as any)
    const activeTickers = Array.from(positions.values())
      .filter(p => p.quantity > 0 && (!filterClass || p.assetClass === filterClass))

    if (activeTickers.length === 0) return { assets: [], params: { bazinYield, ke, g, lynchGrowth, cdiAnnual } }

    const tickers = activeTickers.map(p => p.ticker)

    // Busca preços atuais e fundamentais em paralelo
    const brapiToken = process.env.BRAPI_TOKEN ?? ''
    const [currentPrices, ...fundamentalsArr] = await Promise.all([
      fetchQuotes(tickers),
      ...tickers.map(t => fetchFundamentals(t, brapiToken)),
    ])
    const fundamentalsMap = new Map(tickers.map((t, i) => [t, fundamentalsArr[i]]))

    // DPA (Dividendo Por Ação) dos últimos 12 meses por ativo
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

    const dpaMap = new Map<string, number>()
    for (const div of dividends) {
      if (new Date(div.payDate) < twelveMonthsAgo) continue
      const pos = activeTickers.find(p => p.assetId === div.assetId)
      if (!pos || pos.quantity <= 0) continue
      const prev = dpaMap.get(div.assetId) ?? 0
      dpaMap.set(div.assetId, prev + Number(div.valuePerUnit))
    }

    // Monta resultado por ativo
    const assets: CeilingPriceAsset[] = activeTickers.map(pos => {
      const currentPrice = currentPrices.get(pos.ticker) ?? pos.avgPrice
      const fund = fundamentalsMap.get(pos.ticker) ?? { lpa: null, vpa: null }
      const dpa = dpaMap.get(pos.assetId) ?? null
      const isStock = pos.assetClass === 'STOCK'

      const formulas = {
        bazin: calcBazin(dpa, currentPrice, bazinYield),
        graham: calcGraham(fund.lpa, fund.vpa, currentPrice, isStock),
        lynch: calcLynch(fund.lpa, currentPrice, lynchGrowth, isStock),
        gordon: calcGordon(dpa, currentPrice, ke, g),
      }

      const { average, signal } = calcSignal(currentPrice, formulas)

      return {
        ticker: pos.ticker,
        assetClass: pos.assetClass,
        name: pos.ticker,
        currentPrice: Math.round(currentPrice * 100) / 100,
        dpa: dpa !== null ? Math.round(dpa * 100) / 100 : null,
        lpa: fund.lpa !== null ? Math.round(fund.lpa * 100) / 100 : null,
        vpa: fund.vpa !== null ? Math.round(fund.vpa * 100) / 100 : null,
        formulas,
        average,
        signal,
      }
    })

    // Ordenação: BARATO → NEUTRO → CARO → SEM_DADOS
    const order = { BARATO: 0, NEUTRO: 1, CARO: 2, SEM_DADOS: 3 }
    assets.sort((a, b) => order[a.signal] - order[b.signal])

    return {
      assets,
      params: { bazinYield, ke, g, lynchGrowth, cdiAnnual },
    }
  })
}
