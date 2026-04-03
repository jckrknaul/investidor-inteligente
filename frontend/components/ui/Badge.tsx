import clsx from 'clsx'

interface BadgeProps {
  value: number
  suffix?: string
  showSign?: boolean
}

export function VariationBadge({ value, suffix = '%', showSign = true }: BadgeProps) {
  const isPositive = value >= 0
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 text-sm font-medium',
        isPositive ? 'text-green-400' : 'text-red-400'
      )}
    >
      {showSign && (isPositive ? '▲' : '▼')}
      {Math.abs(value).toFixed(2)}{suffix}
    </span>
  )
}

export function AssetClassBadge({ cls }: { cls: string }) {
  const labels: Record<string, string> = {
    FII: 'FII',
    STOCK: 'Ação',
    FIXED_INCOME: 'Renda Fixa',
    TREASURY: 'Tesouro',
    CRYPTO: 'Cripto',
  }
  const colors: Record<string, string> = {
    FII: 'bg-blue-500/15 text-blue-400',
    STOCK: 'bg-green-500/15 text-green-400',
    FIXED_INCOME: 'bg-yellow-500/15 text-yellow-400',
    TREASURY: 'bg-pink-500/15 text-pink-400',
    CRYPTO: 'bg-purple-500/15 text-purple-400',
  }
  return (
    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', colors[cls] ?? 'bg-bg-hover text-text-secondary')}>
      {labels[cls] ?? cls}
    </span>
  )
}
