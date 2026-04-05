const YAHOO_URL = 'https://query1.finance.yahoo.com'
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

function toYahooTicker(ticker: string): string {
  // Criptos já têm sufixo (BTC-USD), índices (^BVSP, ^IFIX) e outros; ações BR recebem .SA
  if (ticker.includes('.') || ticker.includes('-') || ticker.startsWith('^')) return ticker
  return `${ticker}.SA`
}

export async function fetchQuotes(tickers: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  if (tickers.length === 0) return prices

  await Promise.all(tickers.map(async (ticker) => {
    try {
      const symbol = toYahooTicker(ticker)
      const url = `${YAHOO_URL}/v8/finance/chart/${symbol}?interval=1d&range=1d`
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) })
      if (!res.ok) return
      const data = await res.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } }
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice
      if (price) prices.set(ticker, price)
    } catch { /* ignora */ }
  }))

  return prices
}

export async function fetchQuoteForDate(ticker: string, date: string): Promise<number | null> {
  const targetDate = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (targetDate >= today) {
    const prices = await fetchQuotes([ticker])
    return prices.get(ticker) ?? null
  }

  try {
    const symbol = toYahooTicker(ticker)
    // period1 = 2 dias antes (pega fechamento de sextas p/ datas em fim de semana)
    const p1 = Math.floor((targetDate.getTime() - 2 * 86400000) / 1000)
    const p2 = Math.floor((targetDate.getTime() + 2 * 86400000) / 1000)
    const url = `${YAHOO_URL}/v8/finance/chart/${symbol}?interval=1d&period1=${p1}&period2=${p2}`

    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const data = await res.json() as {
      chart?: {
        result?: {
          timestamp?: number[]
          indicators?: { quote?: { close?: (number | null)[] }[] }
        }[]
      }
    }

    const result = data.chart?.result?.[0]
    if (!result?.timestamp?.length) return null

    const timestamps = result.timestamp!
    const closes = result.indicators?.quote?.[0]?.close ?? []
    const targetTime = targetDate.getTime() / 1000

    // Encontra o fechamento mais próximo da data alvo
    let bestClose: number | null = null
    let minDiff = Infinity
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (!close) continue
      const diff = Math.abs(timestamps[i] - targetTime)
      if (diff < minDiff) { minDiff = diff; bestClose = close }
    }

    return bestClose
  } catch {
    return null
  }
}

export async function fetchYearHistory(ticker: string): Promise<{ ts: number; close: number }[]> {
  try {
    const symbol = toYahooTicker(ticker)
    const url = `${YAHOO_URL}/v8/finance/chart/${symbol}?interval=1d&range=1y`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json() as {
      chart?: {
        result?: {
          timestamp?: number[]
          indicators?: { quote?: { close?: (number | null)[] }[] }
        }[]
      }
    }

    const result = data.chart?.result?.[0]
    if (!result?.timestamp?.length) return []

    const timestamps = result.timestamp!
    const closes = result.indicators?.quote?.[0]?.close ?? []

    return timestamps
      .map((ts, i) => ({ ts, close: closes[i] ?? 0 }))
      .filter(e => e.close > 0)
  } catch {
    return []
  }
}

async function fetchMonthlyHistoryBrapi(ticker: string, fromDate: Date): Promise<{ ts: number; close: number }[]> {
  try {
    const token = process.env.BRAPI_TOKEN ?? ''
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?range=1y&interval=1mo&token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json() as {
      results?: { historicalDataPrice?: { date: number; close: number | null }[] }[]
    }
    const prices = data.results?.[0]?.historicalDataPrice ?? []
    return prices
      .filter(p => p.close && p.close > 0 && p.date * 1000 >= fromDate.getTime())
      .map(p => ({ ts: p.date, close: p.close! }))
      .sort((a, b) => a.ts - b.ts)
  } catch {
    return []
  }
}

export async function fetchMonthlyHistory(ticker: string, fromDate: Date): Promise<{ ts: number; close: number }[]> {
  // IFIX não está disponível no Yahoo Finance — usa brapi
  if (ticker === '^IFIX') return fetchMonthlyHistoryBrapi('IFIX', fromDate)

  try {
    const symbol = toYahooTicker(ticker)
    const period1 = Math.floor(fromDate.getTime() / 1000)
    const period2 = Math.floor(Date.now() / 1000)
    const url = `${YAHOO_URL}/v8/finance/chart/${symbol}?interval=1mo&period1=${period1}&period2=${period2}`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json() as {
      chart?: {
        result?: {
          timestamp?: number[]
          indicators?: { adjclose?: { adjclose?: (number | null)[] }[]; quote?: { close?: (number | null)[] }[] }
        }[]
      }
    }
    const result = data.chart?.result?.[0]
    if (!result?.timestamp?.length) return []
    const timestamps = result.timestamp!
    // Use raw close (not adjclose) — adjclose applies dividend/split adjustments retroactively
    // which conflicts with raw transaction prices entered by the user
    const closes = result.indicators?.quote?.[0]?.close ?? []
    return timestamps
      .map((ts, i) => ({ ts, close: closes[i] ?? 0 }))
      .filter(e => e.close > 0)
  } catch {
    return []
  }
}

// For daily data: find closest timestamp (used in dashboard)
export function priceAtDate(history: { ts: number; close: number }[], targetTs: number): number | null {
  if (!history.length) return null
  let best = history[0]
  let minDiff = Math.abs(history[0].ts - targetTs)
  for (const entry of history) {
    const diff = Math.abs(entry.ts - targetTs)
    if (diff < minDiff) { minDiff = diff; best = entry }
  }
  return best.close
}

// For monthly data: find the close price for a given target year+month.
// Yahoo Finance monthly candles may be timestamped at start-of-month OR at the
// first trading day of the following month, so timestamp comparison is unreliable.
// Strategy: find the candle whose timestamp is closest to the target month's midpoint.
export function priceAtOrBefore(history: { ts: number; close: number }[], targetTs: number): number | null {
  if (!history.length) return null
  const target = new Date(targetTs * 1000)
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()

  // Target midpoint = 15th of target month
  const midpoint = Date.UTC(targetYear, targetMonth, 15) / 1000

  // Find the candle whose timestamp is closest to the 15th of the target month
  let best = history[0]
  let minDiff = Math.abs(history[0].ts - midpoint)
  for (const entry of history) {
    const diff = Math.abs(entry.ts - midpoint)
    if (diff < minDiff) { minDiff = diff; best = entry }
  }
  return best.close
}

// ─── Proventos automáticos ────────────────────────────────────────────────────

export type DividendType = 'DIVIDEND' | 'JCP' | 'INCOME' | 'AMORTIZATION' | 'SUBSCRIPTION'

export interface DividendEvent {
  exDate: Date
  payDate: Date
  valuePerUnit: number
  type: DividendType
}

function normDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function brapiLabelToType(label: string): DividendType {
  const l = label.toUpperCase()
  if (l.includes('JSCP') || l.includes('JCP')) return 'JCP'
  if (l.includes('RENDIMENTO') || l.includes('INCOME')) return 'INCOME'
  if (l.includes('AMORTIZ')) return 'AMORTIZATION'
  if (l.includes('SUBSCRI')) return 'SUBSCRIPTION'
  return 'DIVIDEND'
}

async function fetchDividendsBrapi(ticker: string, since: Date, token: string): Promise<DividendEvent[]> {
  try {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${token}&dividends=true`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json() as {
      results?: {
        dividendsData?: {
          cashDividends?: {
            paymentDate?: string
            rate?: number
            label?: string
            lastDatePrior?: string
          }[]
        }
      }[]
    }

    const items = data.results?.[0]?.dividendsData?.cashDividends ?? []
    const sinceTs = since.getTime()

    return items
      .filter(item => item.rate && item.lastDatePrior)
      .map(item => {
        const exDate = normDate(new Date(item.lastDatePrior!))
        const payDate = item.paymentDate ? normDate(new Date(item.paymentDate)) : exDate
        return { exDate, payDate, valuePerUnit: item.rate!, type: brapiLabelToType(item.label ?? '') }
      })
      .filter(e => e.exDate.getTime() >= sinceTs)
  } catch {
    return []
  }
}

async function fetchDividendsStatusInvest(ticker: string, since: Date): Promise<DividendEvent[]> {
  try {
    const url = `https://statusinvest.com.br/fii/companytickerprovents?ticker=${encodeURIComponent(ticker)}&chartProventsType=2`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://statusinvest.com.br/',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []

    const data = await res.json() as {
      assetEarningsModels?: { ed: string; pd: string; v: number; et: string }[]
    }

    const items = data.assetEarningsModels ?? []
    const sinceTs = since.getTime()

    return items
      .filter(item => item.ed && item.v > 0)
      .map(item => {
        // Formato dd/MM/yyyy → Date
        const parseDate = (s: string) => {
          const [d, m, y] = s.split('/')
          return normDate(new Date(Number(y), Number(m) - 1, Number(d)))
        }
        const exDate = parseDate(item.ed)
        const payDate = item.pd ? parseDate(item.pd) : exDate
        const type: DividendType = item.et.toUpperCase().includes('JCP') ? 'JCP'
          : item.et.toUpperCase().includes('AMORT') ? 'AMORTIZATION'
          : 'INCOME'
        return { exDate, payDate, valuePerUnit: item.v, type }
      })
      .filter(e => e.exDate.getTime() >= sinceTs)
  } catch {
    return []
  }
}

async function fetchDividendsYahoo(ticker: string, since: Date, assetClass: string): Promise<DividendEvent[]> {
  try {
    const symbol = toYahooTicker(ticker)
    const p1 = Math.floor(since.getTime() / 1000)
    const p2 = Math.floor(Date.now() / 1000)
    const url = `${YAHOO_URL}/v8/finance/chart/${symbol}?events=dividends&period1=${p1}&period2=${p2}&interval=1d`

    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json() as {
      chart?: {
        result?: {
          events?: {
            dividends?: Record<string, { amount: number; date: number }>
          }
        }[]
      }
    }

    const raw = data.chart?.result?.[0]?.events?.dividends ?? {}
    const type: DividendType = (assetClass === 'FII' || assetClass === 'FIXED_INCOME') ? 'INCOME' : 'DIVIDEND'

    return Object.values(raw).map(ev => {
      const exDate = normDate(new Date(ev.date * 1000))
      return { exDate, payDate: exDate, valuePerUnit: ev.amount, type }
    })
  } catch {
    return []
  }
}

export async function fetchDividends(
  ticker: string,
  since: Date,
  assetClass: string,
): Promise<DividendEvent[]> {
  const isFII = assetClass === 'FII'
  const brapiToken = process.env.BRAPI_TOKEN

  // FIIs: Status Invest tem datas de pagamento reais e valores corretos
  if (isFII) {
    const siEvents = await fetchDividendsStatusInvest(ticker, since)
    if (siEvents.length > 0) return siEvents
  }

  // Ações/outros: brapi (JCP, tipo correto)
  if (!isFII && brapiToken) {
    const brapiEvents = await fetchDividendsBrapi(ticker, since, brapiToken)
    if (brapiEvents.length > 0) return brapiEvents
  }

  // Fallback: Yahoo Finance
  return fetchDividendsYahoo(ticker, since, assetClass)
}

// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFIISegment(ticker: string): Promise<string | null> {
  const token = process.env.BRAPI_TOKEN
  if (!token) return null
  try {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${token}&modules=summaryProfile`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null

    const data = await res.json() as {
      results?: { summaryProfile?: { industry?: string; longBusinessSummary?: string } }[]
    }

    const profile = data.results?.[0]?.summaryProfile
    const raw = (profile?.industry ?? '').toLowerCase()
    const summary = (profile?.longBusinessSummary ?? '').toLowerCase()
    const text = raw || summary

    if (!text) return null

    if (/recebív|papel|cri\b|cra\b/.test(text)) return 'Papel'
    if (/fundo.de.fundo|fof\b/.test(text))       return 'FOF'
    if (/desenvolv/.test(text))                   return 'Desenvolvimento'
    if (/multicategor|híbrido|hibrido/.test(text)) return 'Híbrido'
    // Tijolo: logística, shopping, lajes, galpão, residencial, agência, hotel, hospital, etc.
    return 'Tijolo'
  } catch {
    return null
  }
}

export async function searchTickers(query: string): Promise<{ ticker: string; name: string; type: string; sector: string | null }[]> {
  const token = process.env.BRAPI_TOKEN
  if (token) {
    try {
      const url = `https://brapi.dev/api/quote/list?search=${encodeURIComponent(query)}&token=${token}&limit=10`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as {
          stocks?: { stock: string; name: string; type: string; sector: string | null }[]
        }
        const results = (data.stocks ?? []).map(s => ({
          ticker: s.stock,
          name: s.name,
          type: s.type,        // 'stock' | 'fund' | 'bdr'
          sector: s.sector,
        }))
        if (results.length > 0) return results
      }
    } catch { /* fallback */ }
  }

  // Fallback: Yahoo Finance
  try {
    const url = `${YAHOO_URL}/v1/finance/search?q=${encodeURIComponent(query)}&lang=pt-BR&region=BR&quotesCount=10`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json() as {
      quotes?: { symbol: string; shortname?: string; longname?: string; quoteType?: string; sector?: string }[]
    }
    return (data.quotes ?? [])
      .filter(q => q.symbol?.endsWith('.SA') || q.symbol?.includes('-'))
      .map(q => ({
        ticker: q.symbol.replace('.SA', ''),
        name: q.shortname ?? q.longname ?? q.symbol,
        type: q.quoteType?.toLowerCase() ?? 'stock',
        sector: q.sector ?? null,
      }))
  } catch {
    return []
  }
}
