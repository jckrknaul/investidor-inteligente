'use client'
import { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { performanceApi } from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function ReturnCell({ value }: { value: number | null }) {
  if (value === null) return <td className="px-3 py-2.5 text-center text-text-muted text-xs">-</td>
  const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-text-secondary'
  return (
    <td className={`px-3 py-2.5 text-center text-xs font-medium ${color}`}>
      {value.toFixed(2)}%
    </td>
  )
}

function KPIBlock({
  label, value, vsCdi, period,
}: { label: string; value: number; vsCdi: number; period: string }) {
  const positive = value >= 0
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs text-text-muted">{period}</p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {positive ? <TrendingUp size={16} className="text-green-400" /> : <TrendingDown size={16} className="text-red-400" />}
        <span className={`text-2xl font-bold ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {value.toFixed(2)}%
        </span>
      </div>
      <p className={`text-xs mt-0.5 ${vsCdi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {vsCdi >= 0 ? '+' : ''}{vsCdi.toFixed(2)}% {vsCdi >= 0 ? 'acima' : 'abaixo'} do CDI
      </p>
    </Card>
  )
}

type ChartFilter = 'all' | 'ytd' | '12m' | '2y' | '5y'

const FILTER_OPTIONS: { value: ChartFilter; label: string }[] = [
  { value: 'all', label: 'Desde o início' },
  { value: 'ytd', label: 'Ano atual' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: '2y', label: 'Últimos 2 anos' },
  { value: '5y', label: 'Últimos 5 anos' },
]

function rebaseChartSeries(series: { label: string; portfolio: number; cdi: number | null; ibov: number | null; ifix: number | null }[]) {
  if (series.length === 0) return series
  const base = series[0]
  return series.map(p => ({
    ...p,
    portfolio: Math.round((((1 + p.portfolio / 100) / (1 + base.portfolio / 100)) - 1) * 10000) / 100,
    cdi: p.cdi !== null && base.cdi !== null ? Math.round((((1 + p.cdi / 100) / (1 + base.cdi / 100)) - 1) * 10000) / 100 : p.cdi,
    ibov: p.ibov !== null && base.ibov !== null ? Math.round((((1 + p.ibov / 100) / (1 + base.ibov / 100)) - 1) * 10000) / 100 : p.ibov,
    ifix: p.ifix !== null && base.ifix !== null ? Math.round((((1 + p.ifix / 100) / (1 + base.ifix / 100)) - 1) * 10000) / 100 : p.ifix,
  }))
}

export default function PerformancePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof performanceApi.get>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartFilter, setChartFilter] = useState<ChartFilter>('all')

  useEffect(() => {
    const walletId = localStorage.getItem('walletId') ?? ''
    if (!walletId) return
    setLoading(true)
    performanceApi.get(walletId)
      .then(setData)
      .catch(() => setError('Erro ao carregar rentabilidade'))
      .finally(() => setLoading(false))
  }, [])

  const filteredChartSeries = useMemo(() => {
    if (!data) return []
    const series = data.chartSeries
    if (chartFilter === 'all') return series

    const now = new Date()
    let cutoff: Date

    if (chartFilter === 'ytd') {
      cutoff = new Date(now.getFullYear(), 0, 1)
    } else if (chartFilter === '12m') {
      cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 12)
    } else if (chartFilter === '2y') {
      cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 2)
    } else {
      cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 5)
    }

    const cutoffLabel = `${String(cutoff.getMonth() + 1).padStart(2, '0')}/${String(cutoff.getFullYear()).slice(2)}`

    // Find the index of the last point before or at cutoff to use as base
    let startIdx = 0
    for (let i = 0; i < series.length; i++) {
      const [mm, yy] = series[i].label.split('/')
      const pointDate = new Date(2000 + Number(yy), Number(mm) - 1, 1)
      if (pointDate <= cutoff) startIdx = i
      else break
    }

    const sliced = series.slice(startIdx)
    return rebaseChartSeries(sliced)
  }, [data, chartFilter])

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Rentabilidade</h1>
        <p className="text-text-secondary text-sm mt-0.5">Retorno da carteira comparado ao CDI</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-text-muted text-sm animate-pulse">Carregando...</div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KPIBlock
              label="Rentabilidade"
              value={data.kpis.totalReturnPct}
              vsCdi={data.kpis.totalVsCdi}
              period="Desde o início"
            />
            <KPIBlock
              label="Rentabilidade"
              value={data.kpis.last12mReturnPct}
              vsCdi={data.kpis.last12mVsCdi}
              period="Últimos 12 meses"
            />
            <KPIBlock
              label="Rentabilidade"
              value={data.kpis.lastMonthReturnPct}
              vsCdi={data.kpis.lastMonthVsCdi}
              period="Último mês"
            />
          </div>

          {/* Chart */}
          <Card className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-text-primary">Rentabilidade acumulada comparada com índices</h2>
              <div className="flex bg-bg-primary border border-border rounded-lg overflow-hidden text-xs">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setChartFilter(opt.value)}
                    className={`px-3 py-1.5 font-medium transition-colors ${
                      chartFilter === opt.value ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={filteredChartSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v.toFixed(0)}%`}
                  width={48}
                />
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                  formatter={(v: number, name: string) => {
                    const labels: Record<string, string> = { portfolio: 'Carteira', cdi: 'CDI', ibov: 'IBOV', ifix: 'IFIX' }
                    return [`${v.toFixed(2)}%`, labels[name] ?? name]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(v) => ({ portfolio: 'Carteira', cdi: 'CDI', ibov: 'IBOV', ifix: 'IFIX' }[v] ?? v)}
                />
                <Line type="monotone" dataKey="portfolio" stroke="var(--accent)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="cdi" stroke="#f5a623" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls strokeDasharray="4 2" />
                <Line type="monotone" dataKey="ibov" stroke="#a78bfa" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls strokeDasharray="4 2" />
                <Line type="monotone" dataKey="ifix" stroke="#34d399" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Monthly Table */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Rentabilidade Mensal</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                    <th className="px-3 py-3 text-left">Ano</th>
                    {MONTHS.map(m => (
                      <th key={m} className="px-3 py-3 text-center">{m}</th>
                    ))}
                    <th className="px-3 py-3 text-center">Ano</th>
                    <th className="px-3 py-3 text-center">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthlyTable.map(row => (
                    <tr key={row.year} className="border-t border-border hover:bg-bg-hover transition-colors">
                      <td className="px-3 py-2.5 text-text-primary font-semibold text-sm">{row.year}</td>
                      {row.months.map((v, i) => <ReturnCell key={i} value={v} />)}
                      <td className={`px-3 py-2.5 text-center text-xs font-semibold ${row.yearTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {row.yearTotal.toFixed(2)}%
                      </td>
                      <td className={`px-3 py-2.5 text-center text-xs font-semibold ${row.accumulated >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {row.accumulated.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </AppLayout>
  )
}
