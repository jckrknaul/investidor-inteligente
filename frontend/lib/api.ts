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
}

// Auth
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data).then(r => r.data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then(r => r.data),
}

// Dashboard
export const dashboardApi = {
  get: (walletId: string) =>
    api.get(`/wallets/${walletId}/dashboard`).then(r => r.data),
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
}
