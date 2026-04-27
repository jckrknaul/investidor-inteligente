import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { fetchQuotes } from '../services/quotes'

const BRAPI = 'https://brapi.dev/api'
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Fundamentals {
  lpa: number | null              // Lucro Por Ação (LTM)
  dpa12m: number | null           // Soma de dividendos pagos nos últimos 12 meses
  dy12m: number | null            // Dividend Yield 12m (%)
  sharesOutstanding: number | null
  netIncome: number | null        // Lucro líquido (último ano fiscal)
}

interface ProjectionRow {
  id: string
  ticker: string
  dyEsperado: number
  margemCrescimento: number
  payout: number                       // % (0–100) — informado pelo usuário
  payoutAtual: number | null           // % calculado de DPA/LPA atuais (referência)
  lucroAnterior: number                // R$ — informado pelo usuário (pré-preenchido pela API)
  lucroLiquidoApi: number | null       // R$ vindo da API (referência)
  cotacaoAtual: number | null
  dy12m: number | null
  lpa: number | null
  dpa: number | null
  nPapeis: number | null
  lucroProjetivo: number | null
  lpaProjetivo: number | null
  dpaProjetivo: number | null
  precoTetoProjetivo: number | null
  upside: number | null                // % vs cotação atual
  signal: 'BARATO' | 'NEUTRO' | 'CARO' | 'SEM_DADOS'
  createdAt: Date
}

// ─── Cache de fundamentos (1h por ticker) ─────────────────────────────────────
const fundCache = new Map<string, { data: Fundamentals; ts: number }>()
const FUND_TTL = 60 * 60 * 1000

// ─── Busca fundamentos via brapi ──────────────────────────────────────────────
async function fetchFundamentals(ticker: string): Promise<Fundamentals> {
  const cached = fundCache.get(ticker)
  if (cached && Date.now() - cached.ts < FUND_TTL) return cached.data

  const empty: Fundamentals = { lpa: null, dpa12m: null, dy12m: null, sharesOutstanding: null, netIncome: null }
  const token = process.env.BRAPI_TOKEN ?? ''
  if (!token) return empty

  try {
    const modules = 'defaultKeyStatistics,incomeStatementHistory'
    const url = `${BRAPI}/quote/${encodeURIComponent(ticker)}?modules=${modules}&dividends=true&token=${token}`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return empty
    const json = await res.json() as any
    const r = json?.results?.[0]
    if (!r) return empty

    const ks = r.defaultKeyStatistics ?? {}
    const lpa: number | null = (typeof r.earningsPerShare === 'number' ? r.earningsPerShare : null)
                            ?? (typeof ks.earningsPerShare === 'number' ? ks.earningsPerShare : null)
                            ?? (typeof ks.trailingEps === 'number' ? ks.trailingEps : null)

    const dyRaw: number | null = (typeof ks.dividendYield === 'number' ? ks.dividendYield : null)
                              ?? (typeof ks.yield === 'number' ? ks.yield : null)
    // brapi entrega DY já em % (ex.: 7.52). Se vier <1 assume fração.
    const dy12m: number | null = dyRaw === null ? null : (dyRaw < 1 ? dyRaw * 100 : dyRaw)

    const sharesOutstanding: number | null = typeof ks.sharesOutstanding === 'number'
      ? ks.sharesOutstanding
      : (typeof r.sharesOutstanding === 'number' ? r.sharesOutstanding : null)

    // Lucro líquido — último ano fiscal disponível
    const incList: any[] = Array.isArray(r.incomeStatementHistory) ? r.incomeStatementHistory : []
    const yearly = incList
      .filter(x => x?.type === 'yearly')
      .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))
    const netIncome: number | null = typeof yearly[0]?.netIncome === 'number' ? yearly[0].netIncome : null

    // DPA 12m: soma de dividendos com paymentDate nos últimos 365 dias
    const dividends: any[] = r.dividendsData?.cashDividends ?? json?.results?.[0]?.dividendsData?.cashDividends ?? []
    const since = Date.now() - 365 * 24 * 3600 * 1000
    let dpa12m: number | null = null
    if (Array.isArray(dividends) && dividends.length > 0) {
      let sum = 0
      let any = false
      for (const d of dividends) {
        const dateStr: string | undefined = d.paymentDate ?? d.lastDatePrior ?? d.dataExDate ?? d.exDate
        if (!dateStr) continue
        const ts = new Date(dateStr).getTime()
        if (!isFinite(ts) || ts < since) continue
        const v = typeof d.rate === 'number' ? d.rate : Number(d.rate)
        if (!isFinite(v)) continue
        sum += v
        any = true
      }
      if (any) dpa12m = sum
    }

    const data: Fundamentals = { lpa, dpa12m, dy12m, sharesOutstanding, netIncome }
    fundCache.set(ticker, { data, ts: Date.now() })
    return data
  } catch {
    return empty
  }
}

// ─── Cálculo da projeção ──────────────────────────────────────────────────────
function round(v: number, decimals = 2): number {
  const k = Math.pow(10, decimals)
  return Math.round(v * k) / k
}

function compute(
  cotacao: number | null,
  fund: Fundamentals,
  dyEsperadoPct: number,
  margemPct: number,
  payoutPct: number,
  lucroAnteriorUser: number,
): Pick<ProjectionRow, 'cotacaoAtual' | 'dy12m' | 'lpa' | 'dpa' | 'payoutAtual' | 'nPapeis'
  | 'lucroLiquidoApi' | 'lucroProjetivo' | 'lpaProjetivo' | 'dpaProjetivo'
  | 'precoTetoProjetivo' | 'upside' | 'signal'> & { lucroEfetivo: number | null } {
  const lpa = fund.lpa
  const dpa = fund.dpa12m
  const sharesOutstanding = fund.sharesOutstanding

  // Payout atual (referência informativa): DPA / LPA dos últimos 12 meses
  const payoutAtual = (lpa !== null && lpa > 0 && dpa !== null) ? (dpa / lpa) : null

  // Payout usado no cálculo: o que o usuário informou
  const payoutDecimal = isFinite(payoutPct) ? payoutPct / 100 : null

  // Lucro efetivo: usa o valor do usuário se > 0, senão cai para a API
  const lucroEfetivo = (isFinite(lucroAnteriorUser) && lucroAnteriorUser > 0)
    ? lucroAnteriorUser
    : (fund.netIncome && fund.netIncome > 0 ? fund.netIncome : null)

  // Lucro projetivo: aplica margem sobre o lucro efetivo
  const lucroProjetivo = (lucroEfetivo !== null && isFinite(margemPct))
    ? lucroEfetivo * (1 + margemPct / 100)
    : null

  const lpaProjetivo = (lucroProjetivo !== null && sharesOutstanding && sharesOutstanding > 0)
    ? lucroProjetivo / sharesOutstanding
    : null

  const dpaProjetivo = (lpaProjetivo !== null && payoutDecimal !== null)
    ? lpaProjetivo * payoutDecimal
    : null

  const precoTetoProjetivo = (dpaProjetivo !== null && dyEsperadoPct > 0)
    ? dpaProjetivo / (dyEsperadoPct / 100)
    : null

  const upside = (precoTetoProjetivo !== null && cotacao && cotacao > 0)
    ? (precoTetoProjetivo / cotacao - 1) * 100
    : null

  let signal: ProjectionRow['signal'] = 'SEM_DADOS'
  if (precoTetoProjetivo !== null && cotacao && cotacao > 0) {
    const ratio = cotacao / precoTetoProjetivo
    if (ratio <= 1.0) signal = 'BARATO'
    else if (ratio <= 1.10) signal = 'NEUTRO'
    else signal = 'CARO'
  }

  return {
    cotacaoAtual: cotacao !== null ? round(cotacao, 2) : null,
    dy12m: fund.dy12m !== null ? round(fund.dy12m, 2) : null,
    lpa: lpa !== null ? round(lpa, 2) : null,
    dpa: dpa !== null ? round(dpa, 2) : null,
    payoutAtual: payoutAtual !== null ? round(payoutAtual * 100, 2) : null,
    nPapeis: sharesOutstanding,
    lucroLiquidoApi: fund.netIncome,
    lucroEfetivo,
    lucroProjetivo: lucroProjetivo !== null ? Math.round(lucroProjetivo) : null,
    lpaProjetivo: lpaProjetivo !== null ? round(lpaProjetivo, 4) : null,
    dpaProjetivo: dpaProjetivo !== null ? round(dpaProjetivo, 4) : null,
    precoTetoProjetivo: precoTetoProjetivo !== null ? round(precoTetoProjetivo, 2) : null,
    upside: upside !== null ? round(upside, 2) : null,
    signal,
  }
}

// ─── Rotas ────────────────────────────────────────────────────────────────────
export async function ceilingPriceProjectionRoutes(app: FastifyInstance) {
  // GET — fundamentos de um ticker (para pré-preencher modal de cadastro)
  app.get('/ceiling-price-projections/fundamentals/:ticker', async (req, reply) => {
    const { ticker } = req.params as { ticker: string }
    const t = ticker.toUpperCase()
    const [pricesMap, fund] = await Promise.all([
      fetchQuotes([t]),
      fetchFundamentals(t),
    ])
    const cotacao = pricesMap.get(t) ?? null
    const payoutAtual = (fund.lpa !== null && fund.lpa > 0 && fund.dpa12m !== null)
      ? round((fund.dpa12m / fund.lpa) * 100, 2)
      : null

    return {
      ticker: t,
      cotacaoAtual: cotacao !== null ? round(cotacao, 2) : null,
      lpa: fund.lpa !== null ? round(fund.lpa, 2) : null,
      dpa: fund.dpa12m !== null ? round(fund.dpa12m, 2) : null,
      dy12m: fund.dy12m !== null ? round(fund.dy12m, 2) : null,
      payoutAtual,
      nPapeis: fund.sharesOutstanding,
      lucroLiquidoAnterior: fund.netIncome,
    }
  })

  // GET — lista projeções da carteira já com cálculos
  app.get('/wallets/:walletId/ceiling-price-projections', async (req) => {
    const { walletId } = req.params as { walletId: string }

    const rows = await prisma.ceilingPriceProjection.findMany({
      where: { walletId },
      orderBy: { createdAt: 'asc' },
    })

    if (rows.length === 0) return { items: [] }

    const tickers = rows.map(r => r.ticker.toUpperCase())
    const [pricesMap, ...funds] = await Promise.all([
      fetchQuotes(tickers),
      ...tickers.map(t => fetchFundamentals(t)),
    ])
    const fundMap = new Map(tickers.map((t, i) => [t, funds[i]]))

    const items: ProjectionRow[] = rows.map(r => {
      const ticker = r.ticker.toUpperCase()
      const fund = fundMap.get(ticker) ?? { lpa: null, dpa12m: null, dy12m: null, sharesOutstanding: null, netIncome: null }
      const cotacao = pricesMap.get(ticker) ?? null
      const dyEsperado = parseFloat(r.dyEsperado)
      const margem = parseFloat(r.margemCrescimento)
      const payout = parseFloat(r.payout)
      const lucroAnteriorUser = parseFloat(r.lucroAnterior)
      const computed = compute(cotacao, fund, dyEsperado, margem, payout, lucroAnteriorUser)
      // Expõe o valor efetivamente usado (user > 0 ? user : API fallback)
      const lucroAnterior = computed.lucroEfetivo ?? lucroAnteriorUser
      // omitimos lucroEfetivo do payload final (campo interno)
      const { lucroEfetivo, ...rest } = computed
      return {
        id: r.id,
        ticker,
        dyEsperado,
        margemCrescimento: margem,
        payout,
        lucroAnterior,
        ...rest,
        createdAt: r.createdAt,
      }
    })

    return { items }
  })

  // POST — cria projeção
  app.post('/wallets/:walletId/ceiling-price-projections', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const body = req.body as {
      ticker?: string
      dyEsperado?: number | string
      margemCrescimento?: number | string
      payout?: number | string
      lucroAnterior?: number | string
    }
    const ticker = (body.ticker ?? '').toUpperCase().trim()
    const dy = Number(body.dyEsperado)
    const margem = Number(body.margemCrescimento)
    const payout = Number(body.payout)
    const lucroAnterior = Number(body.lucroAnterior)

    if (!ticker || !isFinite(dy) || dy <= 0 || !isFinite(margem) || !isFinite(payout) || payout < 0
        || !isFinite(lucroAnterior) || lucroAnterior < 0) {
      return reply.code(400).send({ error: 'invalid_input' })
    }

    try {
      const created = await prisma.ceilingPriceProjection.create({
        data: {
          walletId,
          ticker,
          dyEsperado: dy.toString(),
          margemCrescimento: margem.toString(),
          payout: payout.toString(),
          lucroAnterior: lucroAnterior.toString(),
        },
      })
      return reply.code(201).send(created)
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'duplicate_ticker', message: 'Já existe projeção para este ticker' })
      }
      throw e
    }
  })

  // PUT — atualiza projeção (DY Esperado + Margem + Payout + Lucro Anterior)
  app.put('/wallets/:walletId/ceiling-price-projections/:id', async (req, reply) => {
    const { walletId, id } = req.params as { walletId: string; id: string }
    const body = req.body as {
      dyEsperado?: number | string
      margemCrescimento?: number | string
      payout?: number | string
      lucroAnterior?: number | string
    }
    const dy = Number(body.dyEsperado)
    const margem = Number(body.margemCrescimento)
    const payout = Number(body.payout)
    const lucroAnterior = Number(body.lucroAnterior)

    if (!isFinite(dy) || dy <= 0 || !isFinite(margem) || !isFinite(payout) || payout < 0
        || !isFinite(lucroAnterior) || lucroAnterior < 0) {
      return reply.code(400).send({ error: 'invalid_input' })
    }

    const existing = await prisma.ceilingPriceProjection.findUnique({ where: { id } })
    if (!existing || existing.walletId !== walletId) {
      return reply.code(404).send({ error: 'not_found' })
    }

    const updated = await prisma.ceilingPriceProjection.update({
      where: { id },
      data: {
        dyEsperado: dy.toString(),
        margemCrescimento: margem.toString(),
        payout: payout.toString(),
        lucroAnterior: lucroAnterior.toString(),
      },
    })
    return updated
  })

  // DELETE
  app.delete('/wallets/:walletId/ceiling-price-projections/:id', async (req, reply) => {
    const { walletId, id } = req.params as { walletId: string; id: string }
    const existing = await prisma.ceilingPriceProjection.findUnique({ where: { id } })
    if (!existing || existing.walletId !== walletId) {
      return reply.code(404).send({ error: 'not_found' })
    }
    await prisma.ceilingPriceProjection.delete({ where: { id } })
    return reply.code(204).send()
  })
}
