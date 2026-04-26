import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { calcPositions } from '../services/portfolio'

const YAHOO_URL = 'https://query1.finance.yahoo.com'
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

interface IndexDef {
  symbol: string
  name: string
  flag?: string
}

const HIGHLIGHTS: IndexDef[] = [
  { symbol: '^BVSP',    name: 'Ibovespa',          flag: '🇧🇷' },
  { symbol: '^GSPC',    name: 'S&P 500',           flag: '🇺🇸' },
  { symbol: 'DX-Y.NYB', name: 'DXY',               flag: '🇺🇸' },
  { symbol: 'BRL=X',    name: 'USD/BRL',            flag: '🇧🇷' },
  { symbol: 'BZ=F',     name: 'Petróleo (Brent)',   flag: '🛢️' },
  { symbol: 'BTC-USD',  name: 'BTC/USD',            flag: '₿' },
]

const AMERICAS: IndexDef[] = [
  { symbol: '^BVSP',    name: 'Ibovespa',           flag: '🇧🇷' },
  { symbol: 'BRSMAL.SA', name: 'Small Caps',        flag: '🇧🇷' },
  { symbol: '^IFIX',    name: 'IFIX',               flag: '🇧🇷' },
  { symbol: '^VIX',     name: 'S&P 500 VIX',        flag: '🇺🇸' },
  { symbol: '^GSPC',    name: 'S&P 500',            flag: '🇺🇸' },
  { symbol: '^DJI',     name: 'Dow Jones',           flag: '🇺🇸' },
  { symbol: '^IXIC',    name: 'Nasdaq Composite',    flag: '🇺🇸' },
  { symbol: '^RUT',     name: 'Russell 2000',        flag: '🇺🇸' },
  { symbol: '^GSPTSE',  name: 'S&P/TSX Composite',   flag: '🇨🇦' },
]

const EUROPE: IndexDef[] = [
  { symbol: '^FTSE',    name: 'FTSE 100',           flag: '🇬🇧' },
  { symbol: '^GDAXI',   name: 'DAX',                flag: '🇩🇪' },
  { symbol: '^FCHI',    name: 'CAC 40',             flag: '🇫🇷' },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50',     flag: '🇪🇺' },
  { symbol: '^IBEX',    name: 'IBEX 35',            flag: '🇪🇸' },
  { symbol: '^SSMI',    name: 'SMI',                flag: '🇨🇭' },
]

const ASIA: IndexDef[] = [
  { symbol: '^N225',    name: 'Nikkei 225',          flag: '🇯🇵' },
  { symbol: '^TOPX',    name: 'TOPIX',               flag: '🇯🇵' },
  { symbol: '^HSI',     name: 'Hang Seng',           flag: '🇭🇰' },
  { symbol: '000001.SS', name: 'Shanghai Composite',  flag: '🇨🇳' },
  { symbol: '399001.SZ', name: 'Shenzhen Component',  flag: '🇨🇳' },
  { symbol: '^KS11',    name: 'KOSPI',               flag: '🇰🇷' },
  { symbol: '^NSEI',    name: 'Nifty 50',            flag: '🇮🇳' },
  { symbol: '^BSESN',   name: 'BSE Sensex',          flag: '🇮🇳' },
]

interface QuoteResult {
  name: string
  symbol: string
  price: number | null
  change: number | null
  changePct: number | null
  flag?: string
}

// Cache em memória (5 min TTL)
let cache: { data: any; ts: number } | null = null
const CACHE_TTL = 1000 * 60 * 5

async function fetchYahooQuote(def: IndexDef): Promise<QuoteResult> {
  try {
    const url = `${YAHOO_URL}/v8/finance/chart/${encodeURIComponent(def.symbol)}?interval=1d&range=1d`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { name: def.name, symbol: def.symbol, price: null, change: null, changePct: null, flag: def.flag }
    const data = await res.json() as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number
            previousClose?: number
            chartPreviousClose?: number
          }
        }[]
      }
    }
    const meta = data.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice ?? null
    const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null
    let change: number | null = null
    let changePct: number | null = null
    if (price != null && prevClose != null && prevClose > 0) {
      change = price - prevClose
      changePct = (change / prevClose) * 100
    }
    return {
      name: def.name,
      symbol: def.symbol,
      price: price != null ? Math.round(price * 100) / 100 : null,
      change: change != null ? Math.round(change * 100) / 100 : null,
      changePct: changePct != null ? Math.round(changePct * 100) / 100 : null,
      flag: def.flag,
    }
  } catch {
    return { name: def.name, symbol: def.symbol, price: null, change: null, changePct: null, flag: def.flag }
  }
}

export async function marketRoutes(app: FastifyInstance) {
  app.get('/market/panorama', async () => {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data

    const allDefs = [...HIGHLIGHTS, ...AMERICAS, ...EUROPE, ...ASIA]
    // Dedup por symbol
    const unique = new Map<string, IndexDef>()
    for (const d of allDefs) unique.set(d.symbol, d)

    const results = await Promise.all(
      Array.from(unique.values()).map(d => fetchYahooQuote(d))
    )
    const quoteMap = new Map(results.map(r => [r.symbol, r]))

    const mapDefs = (defs: IndexDef[]) =>
      defs.map(d => {
        const q = quoteMap.get(d.symbol)
        return q ? { ...q, name: d.name, flag: d.flag } : { name: d.name, symbol: d.symbol, price: null, change: null, changePct: null, flag: d.flag }
      })

    const data = {
      highlights: mapDefs(HIGHLIGHTS),
      americas: mapDefs(AMERICAS),
      europe: mapDefs(EUROPE),
      asia: mapDefs(ASIA),
    }

    cache = { data, ts: Date.now() }
    return data
  })

  // Cotações dos ativos em carteira do usuário
  app.get('/market/portfolio-quotes/:walletId', async (req) => {
    const { walletId } = req.params as { walletId: string }

    const transactions = await prisma.transaction.findMany({
      where: { walletId },
      include: { asset: true },
      orderBy: { date: 'asc' },
    })

    const positions = calcPositions(transactions as any)
    const activeTickers = Array.from(positions.values())
      .filter(p => p.quantity > 0 && p.assetClass !== 'FIXED_INCOME')
      .map(p => ({ ticker: p.ticker, assetClass: p.assetClass }))

    if (activeTickers.length === 0) return []

    const results = await Promise.all(
      activeTickers.map(async ({ ticker, assetClass }) => {
        try {
          const symbol = ticker.includes('.') || ticker.includes('-') || ticker.startsWith('^')
            ? ticker : `${ticker}.SA`
          const url = `${YAHOO_URL}/v8/finance/chart/${symbol}?interval=1d&range=1d`
          const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
          if (!res.ok) return { ticker, name: ticker, price: null, change: null, changePct: null, assetClass }
          const data = await res.json() as any
          const meta = data.chart?.result?.[0]?.meta
          const price = meta?.regularMarketPrice ?? null
          const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null
          let change: number | null = null
          let changePct: number | null = null
          if (price != null && prevClose != null && prevClose > 0) {
            change = Math.round((price - prevClose) * 100) / 100
            changePct = Math.round(((price - prevClose) / prevClose) * 10000) / 100
          }
          return { ticker, name: ticker, price, change, changePct, assetClass }
        } catch {
          return { ticker, name: ticker, price: null, change: null, changePct: null, assetClass }
        }
      })
    )

    const classOrder: Record<string, number> = { STOCK: 0, FII: 1, CRYPTO: 2, TREASURY: 3 }
    return results.filter(r => r.price != null).sort((a, b) => {
      const oa = classOrder[a.assetClass] ?? 9
      const ob = classOrder[b.assetClass] ?? 9
      if (oa !== ob) return oa - ob
      return a.ticker.localeCompare(b.ticker)
    })
  })

  // Tesouro Direto — cotações em tempo real via Tesouro Transparente
  let treasuryCache: { data: any; ts: number } | null = null
  const TREASURY_CSV_URL = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PressssTD.csv'

  app.get('/market/treasury', async () => {
    if (treasuryCache && Date.now() - treasuryCache.ts < CACHE_TTL) return treasuryCache.data

    try {
      const res = await fetch(TREASURY_CSV_URL, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return []
      const text = await res.text()
      const lines = text.split('\n').filter(l => l.trim().length > 0)
      if (lines.length < 2) return []

      // Parse header and rows
      const rows = lines.slice(1).map(line => {
        const cols = line.split(';')
        return {
          tipo: cols[0]?.trim() ?? '',
          vencimento: cols[1]?.trim() ?? '',
          dataBase: cols[2]?.trim() ?? '',
          taxaCompra: parseFloat((cols[3] ?? '').replace(',', '.')) || null,
          taxaVenda: parseFloat((cols[4] ?? '').replace(',', '.')) || null,
          puCompra: parseFloat((cols[5] ?? '').replace(',', '.')) || null,
          puVenda: parseFloat((cols[6] ?? '').replace(',', '.')) || null,
        }
      }).filter(r => r.tipo && r.dataBase)

      // Find the latest date
      const parseDate = (d: string) => {
        const [dd, mm, yyyy] = d.split('/')
        return new Date(`${yyyy}-${mm}-${dd}`).getTime()
      }
      let maxDate = ''
      let maxTs = 0
      for (const r of rows) {
        const ts = parseDate(r.dataBase)
        if (ts > maxTs) { maxTs = ts; maxDate = r.dataBase }
      }

      // Filter only latest date
      const latest = rows.filter(r => r.dataBase === maxDate)

      treasuryCache = { data: latest, ts: Date.now() }
      return latest
    } catch {
      return []
    }
  })

  // Maiores ações brasileiras por valor de mercado
  let topBrCache: { data: any; ts: number } | null = null

  app.get('/market/top-br-stocks', async () => {
    if (topBrCache && Date.now() - topBrCache.ts < CACHE_TTL) return topBrCache.data

    const token = process.env.BRAPI_TOKEN
    if (!token) return []

    try {
      const url = `https://brapi.dev/api/quote/list?token=${token}&limit=100&sortBy=market_cap_basic&sortOrder=desc&type=stock`
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return []
      const data = await res.json() as {
        stocks?: { stock: string; name: string; close: number; change: number; volume: number; market_cap: number; sector: string; logo: string }[]
      }
      const stocks = (data.stocks ?? [])
        .filter(s => s.market_cap > 0 && s.close > 0 && !s.stock.endsWith('L'))
        .map(s => ({
          ticker: s.stock,
          name: s.name,
          price: s.close,
          changePct: s.change,
          marketCap: s.market_cap,
          sector: s.sector,
          logo: s.logo,
        }))

      topBrCache = { data: stocks, ts: Date.now() }
      return stocks
    } catch {
      return []
    }
  })
}
