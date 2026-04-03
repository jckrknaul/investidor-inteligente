import { Card } from '@/components/ui/Card'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import clsx from 'clsx'

interface KPICardProps {
  title: string
  value: string
  subtitle?: string
  subtitleValue?: string
  change?: number
  changeLabel?: string
}

export function KPICard({ title, value, subtitle, subtitleValue, change, changeLabel }: KPICardProps) {
  const isPositive = (change ?? 0) >= 0

  return (
    <Card>
      <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">{title}</p>
      <p className="text-2xl font-bold text-text-primary mt-1.5">{value}</p>
      {subtitle && subtitleValue && (
        <p className="text-xs text-text-muted mt-0.5">
          {subtitle}: <span className="text-text-secondary">{subtitleValue}</span>
        </p>
      )}
      {change !== undefined && (
        <p className={clsx('text-sm font-medium mt-2', isPositive ? 'text-green-400' : 'text-red-400')}>
          {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
          {changeLabel && <span className="text-text-muted text-xs ml-1">{changeLabel}</span>}
        </p>
      )}
    </Card>
  )
}
