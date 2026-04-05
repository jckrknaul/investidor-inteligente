import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const api = axios.create({ baseURL: API_URL })

export function getWalletId(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('walletId') ?? ''
}

export function setSession(data: { userId: string; walletId: string; name: string }) {
  localStorage.setItem('userId', data.userId)
  localStorage.setItem('walletId', data.walletId)
  localStorage.setItem('userName', data.name)
}

export function clearSession() {
  localStorage.removeItem('userId')
  localStorage.removeItem('walletId')
  localStorage.removeItem('userName')
}

// Quotes
export const quotesApi = {
  search: (q: string) =>
    api.get('/quotes/search', { params: { q } })
      .then(r => r.data as { ticker: string; name: string; type: string; sector: string | null }[]),
  get: (ticker: string, date?: string) =>
    api.get(`/quotes/${ticker}`, { params: date ? { date } : undefined })
      .then(r => r.data as { ticker: string; price: number }),
  segment: (ticker: string) =>
    api.get(`/quotes/${ticker}/segment`)
      .then(r => r.data as { ticker: string; segment: string | null }),
}

// Auth
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data).then(r => r.data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then(r => r.data),
  google: (credential: string) =>
    api.post('/auth/google', { credential }).then(r => r.data),
}

// Wallets
export const walletsApi = {
  list: (userId: string) =>
    api.get(`/users/${userId}/wallets`).then(r => r.data as { id: string; name: string; createdAt: string }[]),
  create: (userId: string, name: string) =>
    api.post(`/users/${userId}/wallets`, { name }).then(r => r.data as { id: string; name: string }),
  rename: (walletId: string, name: string) =>
    api.put(`/wallets/${walletId}`, { name }).then(r => r.data as { id: string; name: string }),
  remove: (walletId: string) =>
    api.delete(`/wallets/${walletId}`).then(r => r.data),
}

// Performance
export const performanceApi = {
  get: (walletId: string) =>
    api.get(`/wallets/${walletId}/performance`).then(r => r.data as {
      kpis: {
        totalReturnPct: number
        last12mReturnPct: number
        lastMonthReturnPct: number
        totalVsCdi: number
        last12mVsCdi: number
        lastMonthVsCdi: number
      }
      monthlyTable: {
        year: number
        months: (number | null)[]
        yearTotal: number
        accumulated: number
      }[]
      chartSeries: { label: string; portfolio: number; cdi: number | null; ibov: number | null; ifix: number | null }[]
    }),
}

// Stock Price History (daily/weekly)
export const priceHistoryApi = {
  get: (ticker: string, period: string) =>
    api.get(`/stocks/${encodeURIComponent(ticker)}/price-history`, { params: { period } })
      .then(r => r.data as { ticker: string; period: string; interval: string; data: { date: string; close: number; volume: number }[] }),
}

// Stock Analysis
export const stockAnalysisApi = {
  get: (ticker: string) =>
    api.get(`/stocks/${encodeURIComponent(ticker)}/analysis`).then(r => r.data as {
      profile: { ticker: string; name: string; cnpj: string | null; foundedYear: number | null; ipoYear: number | null; sector: string | null; industry: string | null; listingSegment: string | null; otherCodes: string[]; description: string | null; website: string | null; employees: number | null; logoUrl: string | null; marketCap: number | null; enterpriseValue: number | null; shareholdersEquity: number | null; totalAssets: number | null; totalCurrentAssets: number | null; netDebt: number | null; grossDebt: number | null; totalCash: number | null; sharesOutstanding: number | null; freeFloat: number | null; totalRevenue: number | null; ebitda: number | null; netIncome: number | null; avgDailyLiquidity: number | null }
      quote: { price: number; change: number | null; changePct: number | null; volume: number | null; marketCap: number | null; fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null; previousClose: number | null }
      rentabilidade: { '1m': number | null; '3m': number | null; '6m': number | null; '12m': number | null; '24m': number | null; '60m': number | null }
      priceHistory: { date: string; close: number; volume: number }[]
      fundamentals: Record<string, number | null>
      fundamentalsHistory: { year: string; pl: number | null; pvp: number | null; lpa: number | null; vpa: number | null; dy: number | null; roe: number | null; roa: number | null; margemLiquida: number | null; margemEbitda: number | null; price: number | null }[]
      incomeHistory: { year: string; revenue: number | null; netIncome: number | null; grossProfit: number | null; ebitda: number | null; operatingCashflow: number | null; freeCashflow: number | null }[]
      lpaVsPrice: { year: string; lpa: number | null; price: number | null }[]
      dividends: { payDate: string | null; exDate: string | null; value: number; type: string }[]
      dividendsPerYear: { year: string; total: number; dy: number | null }[]
      payoutByYear: { year: string; payout: number | null }[]
      comunicados: { date: string; category: string; description: string; url: string }[]
      comunicadosUrl: string
    }),
}

// Ceiling Price
export const ceilingPriceApi = {
  get: (walletId: string, params?: { assetClass?: string; ke?: number; g?: number; bazinYield?: number; lynchGrowth?: number }) =>
    api.get(`/wallets/${walletId}/ceiling-price`, { params }).then(r => r.data as {
      assets: {
        ticker: string
        assetClass: string
        name: string
        currentPrice: number
        dpa: number | null
        lpa: number | null
        vpa: number | null
        formulas: {
          bazin:  { value: number | null; upside: number | null; valid: boolean; na: boolean }
          graham: { value: number | null; upside: number | null; valid: boolean; na: boolean }
          lynch:  { value: number | null; upside: number | null; valid: boolean; na: boolean }
          gordon: { value: number | null; upside: number | null; valid: boolean; na: boolean }
        }
        average: number | null
        signal: 'BARATO' | 'NEUTRO' | 'CARO' | 'SEM_DADOS'
      }[]
      params: { bazinYield: number; ke: number; g: number; lynchGrowth: number; cdiAnnual: number }
    }),
}

// Dashboard
export const dashboardApi = {
  get: (walletId: string, period?: string) =>
    api.get(`/wallets/${walletId}/dashboard`, { params: period ? { period } : undefined }).then(r => r.data),
}

// Transactions
export const transactionsApi = {
  list: (walletId: string, params?: { assetClass?: string; ticker?: string }) =>
    api.get(`/wallets/${walletId}/transactions`, { params }).then(r => r.data),
  create: (walletId: string, data: any) =>
    api.post(`/wallets/${walletId}/transactions`, data).then(r => r.data),
  update: (id: string, data: any) =>
    api.put(`/transactions/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete(`/transactions/${id}`).then(r => r.data),
}

// Dividends
export const dividendsApi = {
  list: (walletId: string, year?: string) =>
    api.get(`/wallets/${walletId}/dividends`, { params: year ? { year } : undefined }).then(r => r.data),
  create: (walletId: string, data: any) =>
    api.post(`/wallets/${walletId}/dividends`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete(`/dividends/${id}`).then(r => r.data),
  sync: (walletId: string, reset = false) =>
    api.post(`/wallets/${walletId}/dividends/sync`, undefined, { params: reset ? { reset: 'true' } : undefined })
      .then(r => r.data as { inserted: number; tickers: string[] }),
}
