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

// Market Panorama
export const marketApi = {
  panorama: () =>
    api.get('/market/panorama').then(r => r.data as {
      highlights: { name: string; symbol: string; price: number | null; change: number | null; changePct: number | null; flag?: string }[]
      americas: { name: string; symbol: string; price: number | null; change: number | null; changePct: number | null; flag?: string }[]
      europe: { name: string; symbol: string; price: number | null; change: number | null; changePct: number | null; flag?: string }[]
      asia: { name: string; symbol: string; price: number | null; change: number | null; changePct: number | null; flag?: string }[]
    }),
  portfolioQuotes: (walletId: string) =>
    api.get(`/market/portfolio-quotes/${walletId}`).then(r => r.data as {
      ticker: string; name: string; price: number | null; change: number | null; changePct: number | null; assetClass: string
    }[]),
  topBrStocks: () =>
    api.get('/market/top-br-stocks').then(r => r.data as {
      ticker: string; name: string; price: number; changePct: number; marketCap: number; sector: string; logo: string
    }[]),
  treasury: () =>
    api.get('/market/treasury').then(r => r.data as {
      tipo: string; vencimento: string; dataBase: string; taxaCompra: number | null; taxaVenda: number | null; puCompra: number | null; puVenda: number | null
    }[]),
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
  removeAllByAsset: (assetId: string) =>
    api.delete(`/assets/${assetId}/all-transactions`).then(r => r.data),
}

// Projection
export type ProjectionData = {
  patrimonio: string
  anos: number
  defaultAporte: string
  defaultRent: string
  aporteOverrides: Record<string, number>
  rentOverrides: Record<string, number>
}

export const projectionApi = {
  get: (walletId: string) =>
    api.get(`/wallets/${walletId}/projection`)
      .then(r => r.data as ProjectionData & { id: string; walletId: string; updatedAt: string })
      .catch(err => {
        if (err?.response?.status === 404) return null
        throw err
      }),
  save: (walletId: string, data: ProjectionData) =>
    api.put(`/wallets/${walletId}/projection`, data).then(r => r.data),
}

// Valuation (PEGY)
export interface StockPegy {
  ticker: string
  companyName: string
  price: number
  marketCap: number
  pl: number | null
  dy: number | null
  cagrLucros5: number | null
  crescimentoReal: number | null
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

export interface PegyResult {
  macro: {
    ipca5yr: number
    di5yr: number
    jurosReal: number
    ipcaByYear: { year: number; value: number }[]
    selicByYear: { year: number; value: number }[]
    dataRef: string
  }
  stocks: StockPegy[]
}

export const valuationApi = {
  pegy: () => api.get('/valuation/pegy').then(r => r.data as PegyResult),
  refresh: () => api.post('/valuation/pegy/refresh').then(r => r.data as PegyResult),
}

// Ceiling Price Projection (cadastro Bazin Projetivo)
export interface CeilingPriceProjectionRow {
  id: string
  ticker: string
  dyEsperado: number
  margemCrescimento: number
  payout: number                  // % informado pelo usuário
  payoutAtual: number | null      // % calculado (DPA/LPA atuais) — referência
  lucroAnterior: number           // R$ informado pelo usuário
  lucroLiquidoApi: number | null  // R$ vindo da API — referência
  cotacaoAtual: number | null
  dy12m: number | null
  lpa: number | null
  dpa: number | null
  nPapeis: number | null
  lucroProjetivo: number | null
  lpaProjetivo: number | null
  dpaProjetivo: number | null
  precoTetoProjetivo: number | null
  upside: number | null
  signal: 'BARATO' | 'NEUTRO' | 'CARO' | 'SEM_DADOS'
  createdAt: string
}

export interface CeilingPriceProjectionFundamentals {
  ticker: string
  cotacaoAtual: number | null
  lpa: number | null
  dpa: number | null
  dy12m: number | null
  payoutAtual: number | null
  nPapeis: number | null
  lucroLiquidoAnterior: number | null
}

export const ceilingPriceProjectionApi = {
  list: (walletId: string) =>
    api.get(`/wallets/${walletId}/ceiling-price-projections`)
      .then(r => r.data as { items: CeilingPriceProjectionRow[] }),
  fundamentals: (ticker: string) =>
    api.get(`/ceiling-price-projections/fundamentals/${ticker}`)
      .then(r => r.data as CeilingPriceProjectionFundamentals),
  create: (walletId: string, data: { ticker: string; dyEsperado: number; margemCrescimento: number; payout: number; lucroAnterior: number }) =>
    api.post(`/wallets/${walletId}/ceiling-price-projections`, data).then(r => r.data),
  update: (walletId: string, id: string, data: { dyEsperado: number; margemCrescimento: number; payout: number; lucroAnterior: number }) =>
    api.put(`/wallets/${walletId}/ceiling-price-projections/${id}`, data).then(r => r.data),
  remove: (walletId: string, id: string) =>
    api.delete(`/wallets/${walletId}/ceiling-price-projections/${id}`).then(r => r.data),
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
