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

export default function DashboardPage() {
  const { session } = useSession()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const walletId = typeof window !== 'undefined' ? localStorage.getItem('walletId') ?? '' : ''

  const load = async () => {
    if (!walletId) return
    setLoading(true)
    setError('')
    try {
      const d = await dashboardApi.get(walletId)
      setData(d)
    } catch {
      setError('Erro ao carregar dados. Verifique se o backend está rodando.')
    } finally {
      setLoading(false)
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
          onClick={load}
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
            <KPICard
              title="Lucro Total"
              value={formatCurrency(data.kpis.lucroTotal)}
            />
            <KPICard
              title="Proventos (12M)"
              value={formatCurrency(data.kpis.proventos12M)}
            />
            <KPICard
              title="Variação"
              value={formatCurrency(data.kpis.variacao)}
              change={data.kpis.variacaoPct}
            />
            <KPICard
              title="Rentabilidade"
              value={`${data.kpis.rentabilidade.toFixed(2)}%`}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-primary">Evolução do Patrimônio</h2>
                <span className="text-xs text-text-muted">12 meses</span>
              </div>
              <EvolutionChart data={data.evolution} />
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
              <AssetTable groupedAssets={data.groupedAssets} totalPatrimonio={data.kpis.totalPatrimonio} />
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
