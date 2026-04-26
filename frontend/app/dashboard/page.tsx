'use client'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { KPICard } from '@/components/dashboard/KPICard'
import { AssetTable } from '@/components/dashboard/AssetTable'
import { EvolutionChart } from '@/components/charts/EvolutionChart'
import { CompositionChart } from '@/components/charts/CompositionChart'
import { dashboardApi } from '@/lib/api'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { useSession } from '@/lib/store'
import { RefreshCw } from 'lucide-react'

type Period = 'all' | 'ytd' | '12m' | '24m' | '60m'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: 'Desde o início' },
  { value: 'ytd', label: 'Ano atual' },
  { value: '12m', label: '12M' },
  { value: '24m', label: '2A' },
  { value: '60m', label: '5A' },
]

export default function DashboardPage() {
  const { session } = useSession()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState<Period>('12m')

  const walletId = typeof window !== 'undefined' ? localStorage.getItem('walletId') ?? '' : ''

  const load = async (p?: Period) => {
    if (!walletId) return
    setLoading(true)
    setError('')
    try {
      const d = await dashboardApi.get(walletId, p ?? period)
      setData(d)
    } catch {
      setError('Erro ao carregar dados. Verifique se o backend está rodando.')
    } finally {
      setLoading(false)
    }
  }

  const changePeriod = async (p: Period) => {
    setPeriod(p)
    if (!walletId) return
    setChartLoading(true)
    try {
      const d = await dashboardApi.get(walletId, p)
      setData(d)
    } catch { /* ignore */ } finally {
      setChartLoading(false)
    }
  }

  useEffect(() => { load() }, [walletId])

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Resumo da Carteira</h1>
          <p className="text-text-secondary text-sm mt-0.5">Visão geral dos seus investimentos</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary bg-bg-secondary border border-border px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-text-secondary text-sm animate-pulse">Carregando...</div>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard
              title="Patrimônio Total"
              value={formatCurrency(data.kpis.totalPatrimonio)}
              subtitle="Investido"
              subtitleValue={formatCurrency(data.kpis.totalInvestido)}
              change={data.kpis.variacaoPct}
            />
            <Card>
              <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">Lucro Total</p>
              <p className={`text-2xl font-bold mt-1.5 ${data.kpis.lucroTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(data.kpis.lucroTotal)}
              </p>
              <div className="flex gap-4 mt-2">
                <div>
                  <p className="text-[10px] text-text-muted">Ganho de Capital</p>
                  <p className="text-xs text-text-secondary font-medium">{formatCurrency(data.kpis.ganhoCapital)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted">Dividendos Recebidos</p>
                  <p className="text-xs text-text-secondary font-medium">{formatCurrency(data.kpis.proventosTotal)}</p>
                </div>
              </div>
            </Card>
            <KPICard
              title="Proventos (12M)"
              value={formatCurrency(data.kpis.proventos12M)}
              subtitle="Total"
              subtitleValue={formatCurrency(data.kpis.proventosTotal)}
            />
            <KPICard
              title="Variação"
              value={formatCurrency(data.kpis.variacao)}
              change={data.kpis.variacaoPct}
            />
            <Card>
              <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">Rentabilidade</p>
              <p className={`text-2xl font-bold mt-1.5 flex items-center gap-1.5 ${data.kpis.rentabilidade >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.kpis.rentabilidade >= 0 ? '▲' : '▼'} {Math.abs(data.kpis.rentabilidade).toFixed(2)}%
              </p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-primary">Evolução do Patrimônio</h2>
                <div className="flex gap-1">
                  {PERIOD_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => changePeriod(opt.value)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        period === opt.value
                          ? 'bg-accent text-white'
                          : 'text-text-muted hover:text-text-primary bg-bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={chartLoading ? 'opacity-50 pointer-events-none' : ''}>
                <EvolutionChart data={data.evolution} />
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-text-primary mb-4">Ativos na Carteira</h2>
              {data.breakdown.length > 0 ? (
                <CompositionChart data={data.breakdown} />
              ) : (
                <div className="flex items-center justify-center h-40 text-text-muted text-sm">
                  Nenhum ativo cadastrado
                </div>
              )}
            </Card>
          </div>

          {/* Asset Table */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Meus Ativos
                <span className="ml-2 text-text-muted font-normal">({data.totalAssets})</span>
              </h2>
            </div>
            {data.totalAssets > 0 ? (
              <AssetTable groupedAssets={data.groupedAssets} totalPatrimonio={data.kpis.totalPatrimonio} onRefresh={() => load()} />
            ) : (
              <div className="flex items-center justify-center h-32 text-text-muted text-sm">
                Nenhum lançamento registrado ainda.{' '}
                <a href="/transactions" className="text-accent ml-1 hover:underline">Adicionar lançamento</a>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </AppLayout>
  )
}
