export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatDate(date: string | Date): string {
  const str = typeof date === 'string' ? date : date.toISOString()
  const [year, month, day] = str.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export const ASSET_CLASS_LABELS: Record<string, string> = {
  FII: 'FIIs',
  STOCK: 'Ações',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  CRYPTO: 'Criptos',
}

export const ASSET_CLASS_COLORS: Record<string, string> = {
  FII: '#58a6ff',
  STOCK: '#3fb950',
  FIXED_INCOME: '#e3b341',
  TREASURY: '#f778ba',
  CRYPTO: '#bc8cff',
}

export const DIVIDEND_TYPE_LABELS: Record<string, string> = {
  DIVIDEND: 'Dividendo',
  JCP: 'JCP',
  INCOME: 'Rendimento',
  AMORTIZATION: 'Amortização',
  SUBSCRIPTION: 'Subscrição',
}
