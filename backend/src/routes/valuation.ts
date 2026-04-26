import { FastifyInstance } from 'fastify'

const SI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://statusinvest.com.br/acoes/busca-avancada',
}

// ─── Cache ────────────────────────────────────────────────────────────────────
interface PegyResult {
  macro: {
    ipca5yr: number        // Média IPCA 5 anos (%)
    di5yr: number          // DI / Selic expectativa 5 anos (%)
    jurosReal: number      // DI - IPCA (%)
    ipcaByYear: { year: number; value: number }[]
    selicByYear: { year: number; value: number }[]
    dataRef: string        // data de referência
  }
  stocks: StockPegy[]
}

interface StockPegy {
  ticker: string
  companyName: string
  price: number
  marketCap: number
  pl: number | null
  dy: number | null
  cagrLucros5: number | null
  crescimentoReal: number | null   // CAGR - IPCA
  pegy: number | null
  pegyAjustado: number | null
  signalPegy: string | null
  signalPegyAjustado: string | null
  roe: number | null
  roic: number | null
  margemLiquida: number | null
  dividaLiquidaEbit: number | null
  lpa: number | null
  vpa: number | null
}

let cache: { data: PegyResult; ts: number } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hora

// ─── Fontes de dados ──────────────────────────────────────────────────────────

/** Média IPCA dos últimos 5 anos completos via BCB SGS (série 433) */
async function fetchIPCA5YearAvg(): Promise<{ avg: number; byYear: { year: number; value: number }[] }> {
  const now = new Date()
  const endYear = now.getFullYear() - 1 // último ano completo
  const startYear = endYear - 4
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/${startYear}&dataFinal=31/12/${endYear}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`BCB IPCA API error: ${res.status}`)
  const data = await res.json() as { data: string; valor: string }[]

  // Agrupar por ano e calcular IPCA anualizado
  const years: Record<number, number[]> = {}
  for (const r of data) {
    const y = parseInt(r.data.split('/')[2])
    if (!years[y]) years[y] = []
    years[y].push(parseFloat(r.valor))
  }

  const byYear: { year: number; value: number }[] = []
  for (const y of Object.keys(years).map(Number).sort()) {
    const monthly = years[y]
    if (monthly.length < 12) continue
    const annual = (monthly.reduce((acc, m) => acc * (1 + m / 100), 1) - 1) * 100
    byYear.push({ year: y, value: parseFloat(annual.toFixed(2)) })
  }

  const avg = byYear.length > 0
    ? byYear.reduce((s, y) => s + y.value, 0) / byYear.length
    : 0

  return { avg: parseFloat(avg.toFixed(2)), byYear }
}

/** Expectativa Selic (proxy DI) para os próximos ~5 anos via BCB Focus */
async function fetchDI5Year(): Promise<{ rate: number; byYear: { year: number; value: number }[] }> {
  const now = new Date()
  const currentYear = now.getFullYear()
  const targetYears = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4]
  const dateFrom = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10) // últimos 14 dias

  const url = `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$filter=Indicador%20eq%20'Selic'%20and%20Data%20ge%20'${dateFrom}'&$top=50&$orderby=Data%20desc&$format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`BCB Focus API error: ${res.status}`)
  const data = await res.json() as {
    value: { Data: string; DataReferencia: string; Mediana: number; tipoCalculo?: string }[]
  }

  // Pegar a mediana mais recente para cada ano
  const byYear: { year: number; value: number }[] = []
  const seen = new Set<number>()
  for (const item of data.value) {
    const year = parseInt(item.DataReferencia)
    if (targetYears.includes(year) && !seen.has(year)) {
      seen.add(year)
      byYear.push({ year, value: item.Mediana })
    }
  }

  byYear.sort((a, b) => a.year - b.year)

  // Média geométrica (composta) das taxas anuais
  if (byYear.length === 0) return { rate: 0, byYear }
  const compound = byYear.reduce((acc, y) => acc * (1 + y.value / 100), 1)
  const geoMean = (Math.pow(compound, 1 / byYear.length) - 1) * 100

  return { rate: parseFloat(geoMean.toFixed(2)), byYear }
}

/** Busca ações na StatusInvest com filtro de valor de mercado */
async function fetchStocksStatusInvest(minMarketCap: number | null, maxMarketCap: number | null): Promise<any[]> {
  const search = {
    Sector: '',
    SubSector: '',
    Segment: '',
    my_range: '-20;100',
    dy: { Item1: null, Item2: null },
    p_L: { Item1: null, Item2: null },
    p_VP: { Item1: null, Item2: null },
    p_Ebit: { Item1: null, Item2: null },
    p_Ativo: { Item1: null, Item2: null },
    ev_Ebit: { Item1: null, Item2: null },
    margemBruta: { Item1: null, Item2: null },
    margemEbit: { Item1: null, Item2: null },
    margemLiquida: { Item1: null, Item2: null },
    p_SR: { Item1: null, Item2: null },
    p_CapitalGiro: { Item1: null, Item2: null },
    p_AtivoCirculante: { Item1: null, Item2: null },
    roe: { Item1: null, Item2: null },
    roic: { Item1: null, Item2: null },
    roa: { Item1: null, Item2: null },
    liquidezCorrente: { Item1: null, Item2: null },
    pl_Ativo: { Item1: null, Item2: null },
    passivo_Ativo: { Item1: null, Item2: null },
    dividaLiquidaEbit: { Item1: null, Item2: null },
    dividaliquidaPatrimonioliquido: { Item1: null, Item2: null },
    gpiScore: { Item1: null, Item2: null },
    valorIntrinseco: { Item1: null, Item2: null },
    eV_Ebitda: { Item1: null, Item2: null },
    ebitdaM: { Item1: null, Item2: null },
    lpiScore: { Item1: null, Item2: null },
    vpa: { Item1: null, Item2: null },
    lpa: { Item1: null, Item2: null },
    valorMercado: { Item1: minMarketCap, Item2: maxMarketCap },
  }

  const url = `https://statusinvest.com.br/category/advancedsearchresult?search=${encodeURIComponent(JSON.stringify(search))}&CategoryType=1`
  const res = await fetch(url, { headers: SI_HEADERS, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`StatusInvest API error: ${res.status}`)
  return await res.json() as any[]
}

// ─── Classificação ────────────────────────────────────────────────────────────

function classifyPegy(value: number | null): string | null {
  if (value === null || !isFinite(value)) return null
  if (value < 0) return 'ARMADILHA'
  if (value < 0.5) return 'PECHINCHA'
  if (value <= 1.0) return 'BARATA'
  return 'CARA'
}

// ─── Cálculo principal ───────────────────────────────────────────────────────

async function computePegy(): Promise<PegyResult> {
  // 1. Buscar dados macro em paralelo
  const [ipca, di] = await Promise.all([fetchIPCA5YearAvg(), fetchDI5Year()])
  const jurosReal = parseFloat((di.rate - ipca.avg).toFixed(2))

  // 2. Buscar ações em 6 faixas estreitas para não ultrapassar o limite de 100 resultados
  //    por requisição do StatusInvest (evita que grandes caps como BBAS3 sejam omitidas)
  const [batch1, batch2, batch3, batch4, batch5, batch6] = await Promise.all([
    fetchStocksStatusInvest(200_000_000_000, null),                    // > 200B
    fetchStocksStatusInvest(50_000_000_000, 199_999_999_999),          // 50B–200B
    fetchStocksStatusInvest(10_000_000_000, 49_999_999_999),           // 10B–50B
    fetchStocksStatusInvest(5_000_000_000, 9_999_999_999),             // 5B–10B
    fetchStocksStatusInvest(1_000_000_000, 4_999_999_999),             // 1B–5B
    fetchStocksStatusInvest(500_000_000, 999_999_999),                 // 500M–1B
  ])

  const allRaw = [...batch1, ...batch2, ...batch3, ...batch4, ...batch5, ...batch6]
    // Filtrar dados inconsistentes (mkt cap > 2T BRL é erro) e DY = 0
    .filter(s => (s.valormercado ?? 0) < 2_000_000_000_000 && (s.dy ?? 0) > 0)

  // Deduplicar por empresa (companyid), manter ticker mais líquido
  const byCompany = new Map<number, any>()
  for (const s of allRaw) {
    const cid = s.companyid
    if (!cid) continue
    const existing = byCompany.get(cid)
    if (!existing || (s.liquidezmediadiaria ?? 0) > (existing.liquidezmediadiaria ?? 0)) {
      byCompany.set(cid, s)
    }
  }

  // 3. Calcular PEGY para cada ação
  const stocks: StockPegy[] = []
  for (const s of byCompany.values()) {
    const pl = s.p_l != null ? s.p_l : null
    const dy = s.dy != null ? s.dy : null
    const cagrLucros5 = s.lucros_cagr5 != null ? s.lucros_cagr5 : null
    const crescimentoReal = cagrLucros5 != null ? parseFloat((cagrLucros5 - ipca.avg).toFixed(2)) : null

    let pegy: number | null = null
    let pegyAjustado: number | null = null

    // PEGY Tradicional: P/L / (CAGR + DY)
    if (pl != null && cagrLucros5 != null && dy != null) {
      const denom = cagrLucros5 + dy
      if (denom !== 0) pegy = parseFloat((pl / denom).toFixed(4))
    }

    // PEGY Ajustado: P/L / [(CAGR - IPCA) + DY - (DI - IPCA)]
    //              = P/L / (CAGR + DY - DI)
    if (pl != null && cagrLucros5 != null && dy != null) {
      const denomAdj = cagrLucros5 + dy - di.rate
      if (denomAdj !== 0) pegyAjustado = parseFloat((pl / denomAdj).toFixed(4))
    }

    stocks.push({
      ticker: s.ticker,
      companyName: s.companyname ?? '',
      price: s.price ?? 0,
      marketCap: s.valormercado ?? 0,
      pl,
      dy,
      cagrLucros5,
      crescimentoReal,
      pegy,
      pegyAjustado,
      signalPegy: classifyPegy(pegy),
      signalPegyAjustado: classifyPegy(pegyAjustado),
      roe: s.roe ?? null,
      roic: s.roic ?? null,
      margemLiquida: s.margemliquida ?? null,
      dividaLiquidaEbit: s.dividaliquidaebit ?? null,
      lpa: s.lpa ?? null,
      vpa: s.vpa ?? null,
    })
  }

  // Ordenar por valor de mercado (maior → menor)
  stocks.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))

  return {
    macro: {
      ipca5yr: ipca.avg,
      di5yr: di.rate,
      jurosReal,
      ipcaByYear: ipca.byYear,
      selicByYear: di.byYear,
      dataRef: new Date().toISOString().slice(0, 10),
    },
    stocks,
  }
}

// ─── Rota ─────────────────────────────────────────────────────────────────────

export async function valuationRoutes(app: FastifyInstance) {
  app.get('/valuation/pegy', async (_req, reply) => {
    // Cache de 1h
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return reply.send(cache.data)
    }

    try {
      const result = await computePegy()
      cache = { data: result, ts: Date.now() }
      return reply.send(result)
    } catch (err: any) {
      app.log.error(err, 'Erro ao calcular PEGY')
      return reply.code(502).send({ error: 'Erro ao buscar dados de valuation', detail: err.message })
    }
  })

  // Força recálculo (limpa cache)
  app.post('/valuation/pegy/refresh', async (_req, reply) => {
    cache = null
    try {
      const result = await computePegy()
      cache = { data: result, ts: Date.now() }
      return reply.send(result)
    } catch (err: any) {
      app.log.error(err, 'Erro ao recalcular PEGY')
      return reply.code(502).send({ error: 'Erro ao recalcular', detail: err.message })
    }
  })
}
