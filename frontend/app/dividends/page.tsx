'use client'
import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { AssetClassBadge } from '@/components/ui/Badge'
import { dividendsApi } from '@/lib/api'
import { formatCurrency, formatDate, DIVIDEND_TYPE_LABELS, ASSET_CLASS_LABELS } from '@/lib/formatters'
import { AssetLogo } from '@/components/ui/AssetLogo'
import { RefreshCw, TrendingUp, X, Pie as PieIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1']
const ITEMS_PER_PAGE = 20

export default function DividendsPage() {
  const [dividends, setDividends] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [walletId, setWalletId] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterTicker, setFilterTicker] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [chartPeriod, setChartPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [modalDistributionType, setModalDistributionType] = useState<'ticker' | 'type'>('ticker')
  const [showFullDistribution, setShowFullDistribution] = useState(false)

  useEffect(() => {
    setWalletId(localStorage.getItem('walletId') ?? '')
  }, [])

  const load = async (id = walletId) => {
    if (!id) return
    setLoading(true)
    try {
      const data = await dividendsApi.list(id)
      setDividends(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [walletId])

  const now = new Date()
  const parseDate = (dateStr: string): Date => {
    const dateOnly = dateStr.slice(0, 10)
    return new Date(dateOnly + 'T00:00:00Z')
  }
  const hasDistinctPayDate = (d: any) => d.payDate.slice(0, 10) !== d.exDate.slice(0, 10)

  // Para FIIs, "Rendimento" (INCOME) deve exibir como "Dividendos"
  const getDividendTypeLabel = (d: any) => {
    if (d.asset?.assetClass === 'FII' && d.type === 'INCOME') {
      return 'Dividendos'
    }
    return DIVIDEND_TYPE_LABELS[d.type as keyof typeof DIVIDEND_TYPE_LABELS] ?? d.type
  }

  // Calcula alíquota de imposto baseado no tipo de provento e classe de ativo
  const getTaxRate = (d: any): number => {
    const { type, asset } = d
    const assetClass = asset?.assetClass

    // Dividendos de ações: Isentos
    if (assetClass === 'STOCK' && type === 'DIVIDEND') return 0

    // JCP (Juros sobre Capital Próprio): 15% IR + 2,5% CSLL ≈ 17,5%
    if (type === 'JCP') return 0.175

    // Rendimento/Dividendos de FII: Isentos
    if (assetClass === 'FII' && type === 'INCOME') return 0

    // Outros rendimentos (não-FII): 20% de IR
    if (type === 'INCOME' && assetClass !== 'FII') return 0.20

    // Amortização: sem imposto no recebimento
    if (type === 'AMORTIZATION') return 0

    // Padrão: sem imposto
    return 0
  }

  // Calcula total líquido
  const calculateNetValue = (d: any): number => {
    const totalValue = Number(d.totalValue)
    const taxRate = getTaxRate(d)
    return totalValue * (1 - taxRate)
  }

  const filteredDividends = useMemo(() => dividends.filter(d => {
    if (!hasDistinctPayDate(d)) return false // Exclui proventos sem data de pagamento
    if (filterClass && d.asset?.assetClass !== filterClass) return false
    if (filterTicker && d.asset?.ticker !== filterTicker) return false
    if (filterType && d.type !== filterType) return false
    if (filterStatus) {
      const payDate = new Date(d.payDate)
      const isReceived = payDate <= now
      if (filterStatus === 'received' && !isReceived) return false
      if (filterStatus === 'pending' && isReceived) return false
    }
    return true
  }), [dividends, filterClass, filterTicker, filterType, filterStatus])

  const classOptions = useMemo(() =>
    [...new Set(dividends.map(d => d.asset?.assetClass).filter(Boolean))].sort()
  , [dividends])

  const tickerOptions = useMemo(() =>
    [...new Set(dividends.map(d => d.asset?.ticker).filter(Boolean))].sort()
  , [dividends])

  const typeOptions = useMemo(() =>
    [...new Set(dividends.map(d => d.type).filter(Boolean))].sort()
  , [dividends])

  // Resumo geral (com filtros)
  const summary = useMemo(() => {
    const withPayDate = filteredDividends.filter(d => hasDistinctPayDate(d))
    const received = withPayDate.filter(d => parseDate(d.payDate) <= now)
    const pending = withPayDate.filter(d => parseDate(d.payDate) > now)

    const receivedValue = received.reduce((s, d) => s + Number(d.totalValue), 0)
    const pendingValue = pending.reduce((s, d) => s + Number(d.totalValue), 0)

    const last12m = (() => {
      const ago = new Date()
      ago.setMonth(ago.getMonth() - 12)
      return withPayDate
        .filter(d => parseDate(d.payDate) >= ago && parseDate(d.payDate) <= now)
        .reduce((s, d) => s + Number(d.totalValue), 0)
    })()

    const avgMonthly = last12m / 12

    return { receivedValue, pendingValue, last12m, avgMonthly }
  }, [filteredDividends])

  // Gráfico mensal
  const monthlyData = useMemo(() => {
    const map = new Map<string, { received: number; pending: number }>()
    const currentYear = now.getUTCFullYear()

    // Preencher todos os 12 meses do ano atual com valores zerados
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`
      map.set(monthKey, { received: 0, pending: 0 })
    }

    // Somar os dados dos proventos
    filteredDividends
      .filter(d => hasDistinctPayDate(d))
      .forEach(d => {
        const payDate = parseDate(d.payDate)
        const payYear = payDate.getUTCFullYear()

        // Apenas incluir dados do ano atual
        if (payYear === currentYear) {
          const monthKey = `${payYear}-${String(payDate.getUTCMonth() + 1).padStart(2, '0')}`
          const isReceived = payDate <= now
          const value = Number(d.totalValue)

          const entry = map.get(monthKey)!
          if (isReceived) entry.received += value
          else entry.pending += value
        }
      })

    return Array.from(map.entries())
      .map(([month, data]) => ({
        month: month.replace('-', '/'),
        received: Math.round(data.received * 100) / 100,
        pending: Math.round(data.pending * 100) / 100,
      }))
      .sort()
  }, [filteredDividends, now])

  // Gráfico anual
  const yearlyData = useMemo(() => {
    const map = new Map<string, { received: number; pending: number }>()

    filteredDividends
      .filter(d => hasDistinctPayDate(d))
      .forEach(d => {
        const payDate = parseDate(d.payDate)
        const yearKey = String(payDate.getUTCFullYear())
        const isReceived = payDate <= now
        const value = Number(d.totalValue)

        if (!map.has(yearKey)) map.set(yearKey, { received: 0, pending: 0 })
        const entry = map.get(yearKey)!
        if (isReceived) entry.received += value
        else entry.pending += value
      })

    return Array.from(map.entries())
      .map(([year, data]) => ({
        month: year,
        received: Math.round(data.received * 100) / 100,
        pending: Math.round(data.pending * 100) / 100,
      }))
      .sort()
      .reverse()
  }, [filteredDividends])

  // Distribuição por ativo - versão completa
  const allDistributionData = useMemo(() => {
    const map = new Map<string, number>()
    filteredDividends
      .filter(d => hasDistinctPayDate(d) && parseDate(d.payDate) <= now)
      .forEach(d => {
        const ticker = d.asset?.ticker ?? 'Unknown'
        map.set(ticker, (map.get(ticker) ?? 0) + Number(d.totalValue))
      })
    return Array.from(map.entries())
      .map(([ticker, value]) => ({ name: ticker, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
  }, [filteredDividends])

  // Apenas top 5 para o gráfico
  const distributionData = allDistributionData.slice(0, 5)

  // Dados do modal por mês
  const modalData = useMemo(() => {
    if (!selectedMonth) return null

    const [year, month] = selectedMonth.split('/')
    const monthDividends = filteredDividends.filter(d => {
      const payDate = parseDate(d.payDate)
      return payDate.getUTCFullYear() === Number(year) && payDate.getUTCMonth() + 1 === Number(month)
    })

    // Distribuição por ativo
    const byTicker = new Map<string, number>()
    monthDividends.forEach(d => {
      const ticker = d.asset?.ticker ?? 'Unknown'
      byTicker.set(ticker, (byTicker.get(ticker) ?? 0) + Number(d.totalValue))
    })
    const tickerData = Array.from(byTicker.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)

    // Distribuição por classe de ativo
    const byAssetClass = new Map<string, number>()
    monthDividends.forEach(d => {
      const assetClass = ASSET_CLASS_LABELS[d.asset?.assetClass as keyof typeof ASSET_CLASS_LABELS] ?? d.asset?.assetClass ?? 'Unknown'
      byAssetClass.set(assetClass, (byAssetClass.get(assetClass) ?? 0) + Number(d.totalValue))
    })
    const typeData = Array.from(byAssetClass.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)

    const total = monthDividends.reduce((s, d) => s + Number(d.totalValue), 0)

    return { tickerData, typeData, total, monthDividends }
  }, [selectedMonth, filteredDividends])

  // Paginação
  const totalPages = Math.ceil(filteredDividends.length / ITEMS_PER_PAGE)
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
  const endIdx = startIdx + ITEMS_PER_PAGE
  const paginatedDividends = filteredDividends.slice(startIdx, endIdx)

  const handlePrevPage = () => setCurrentPage(p => Math.max(1, p - 1))
  const handleNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1))

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await dividendsApi.sync(walletId, true)
      setSyncMsg(
        result.inserted > 0
          ? `${result.inserted} provento(s) importado(s).`
          : 'Nenhum provento novo encontrado.'
      )
      if (result.inserted > 0) {
        setCurrentPage(1)
        await load()
      }
    } catch {
      setSyncMsg('Erro ao sincronizar. Verifique o BRAPI_TOKEN ou tente novamente.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Proventos</h1>
          <p className="text-text-secondary text-sm mt-0.5">Dividendos, JCP e rendimentos recebidos</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-bg-secondary hover:bg-bg-hover border border-border text-text-secondary hover:text-text-primary text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {syncMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${syncMsg.startsWith('Erro') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {syncMsg}
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Média Mensal</p>
              <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.avgMonthly)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Recebido em 2026</p>
              <p className="text-lg font-bold text-blue-400">{formatCurrency(summary.receivedValue)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-gray-300" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">A receber</p>
              <p className="text-lg font-bold text-gray-300">{formatCurrency(summary.pendingValue)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Últimos 12 meses</p>
              <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.last12m)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      {loading ? (
        <Card className="h-96 flex items-center justify-center text-text-muted animate-pulse">
          Carregando gráficos...
        </Card>
      ) : monthlyData.length > 0 || yearlyData.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="col-span-2 p-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">Evolução de Proventos</h3>
              </div>

              {/* Toggle Mensal/Anual */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-bg-primary rounded-lg p-1 border border-border">
                  <button
                    onClick={() => setChartPeriod('monthly')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      chartPeriod === 'monthly'
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Mensal
                  </button>
                  <button
                    onClick={() => setChartPeriod('yearly')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      chartPeriod === 'yearly'
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Anual
                  </button>
                </div>
              </div>

              {/* Filtros para gráficos */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
                <select
                  value={filterClass}
                  onChange={e => { setFilterClass(e.target.value); setFilterTicker('') }}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-xs focus:outline-none focus:border-accent"
                >
                  <option value="">Todas as classes</option>
                  {classOptions.map(c => (
                    <option key={c} value={c}>{ASSET_CLASS_LABELS[c as keyof typeof ASSET_CLASS_LABELS] ?? c}</option>
                  ))}
                </select>

                <select
                  value={filterTicker}
                  onChange={e => setFilterTicker(e.target.value)}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-xs focus:outline-none focus:border-accent"
                >
                  <option value="">Todos os ativos</option>
                  {tickerOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-xs focus:outline-none focus:border-accent"
                >
                  <option value="">Todos os tipos</option>
                  {typeOptions.map(t => (
                    <option key={t} value={t}>{DIVIDEND_TYPE_LABELS[t as keyof typeof DIVIDEND_TYPE_LABELS] ?? t}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-xs focus:outline-none focus:border-accent"
                >
                  <option value="">Todos os status</option>
                  <option value="received">Recebidos</option>
                  <option value="pending">A receber</option>
                </select>

                {(filterClass || filterTicker || filterType || filterStatus) && (
                  <button
                    onClick={() => { setFilterClass(''); setFilterTicker(''); setFilterType(''); setFilterStatus('') }}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X size={13} /> Limpar
                  </button>
                )}

                <span className="ml-auto text-xs text-text-muted">
                  {filteredDividends.length} de {dividends.length}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartPeriod === 'monthly' ? monthlyData : yearlyData}
                  onClick={(state: any) => {
                    if (state?.activeLabel && chartPeriod === 'monthly') {
                      setSelectedMonth(state.activeLabel)
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="month" tick={{ fill: '#999', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#999', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '6px' }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="received" fill="#3b82f6" name="Recebido" radius={[8, 8, 0, 0]} stackId="a" onClick={(data: any) => {
                    if (chartPeriod === 'monthly') setSelectedMonth(data.month)
                  }} />
                  <Bar dataKey="pending" fill="#d1d5db" name="A receber" radius={[8, 8, 0, 0]} stackId="a" onClick={(data: any) => {
                    if (chartPeriod === 'monthly') setSelectedMonth(data.month)
                  }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {distributionData.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-primary">Distribuição (Recebido)</h3>
                {allDistributionData.length > 5 && (
                  <button
                    onClick={() => setShowFullDistribution(true)}
                    className="text-xs text-accent hover:underline font-medium"
                  >
                    Ver todos
                  </button>
                )}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={distributionData} cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} dataKey="value">
                    {distributionData.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1 text-xs">
                {distributionData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {d.name}
                    </span>
                    <span className="text-text-muted">{formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : null}

      {/* Tabela */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm animate-pulse">
            Carregando...
          </div>
        ) : dividends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm gap-2">
            <p>Nenhum provento encontrado.</p>
            <button onClick={handleSync} className="text-accent hover:underline">
              Sincronizar agora
            </button>
          </div>
        ) : filteredDividends.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-text-muted text-sm">
            Nenhum provento com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                  <th className="px-4 py-3 text-left">Ativo</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Data COM</th>
                  <th className="px-4 py-3 text-right">Pagamento</th>
                  <th className="px-4 py-3 text-right">Val/Cota</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Total Líquido</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDividends.map((d: any) => {
                  const payDate = parseDate(d.payDate)
                  const received = hasDistinctPayDate(d) && payDate <= now
                  return (
                    <tr key={d.id} className="border-t border-border hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AssetLogo ticker={d.asset?.ticker} size={24} />
                          <span className="font-semibold text-text-primary">{d.asset?.ticker}</span>
                          <AssetClassBadge cls={d.asset?.assetClass} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-medium">
                          {getDividendTypeLabel(d)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">{formatDate(d.exDate)}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">
                        {hasDistinctPayDate(d) ? formatDate(d.payDate) : <span className="text-text-muted text-xs">≈ Data COM</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(Number(d.valuePerUnit))}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">{Number(d.quantity)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${received ? 'text-blue-400' : 'text-gray-300'}`}>
                        {formatCurrency(Number(d.totalValue))}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${received ? 'text-green-400' : getTaxRate(d) > 0 ? 'text-text-muted' : 'text-green-400'}`}>
                        <div>
                          {formatCurrency(calculateNetValue(d))}
                          {getTaxRate(d) > 0 && (
                            <div className={`text-xs ${received ? 'text-green-300' : 'text-text-muted'}`}>
                              -{formatCurrency(Number(d.totalValue) * getTaxRate(d))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {received ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-400">
                            Recebido
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-500/15 text-gray-300">
                            A receber
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Paginação */}
      {!loading && filteredDividends.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between mt-4 px-4">
          <span className="text-xs text-text-muted">
            Mostrando {startIdx + 1} a {Math.min(endIdx, filteredDividends.length)} de {filteredDividends.length} proventos
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                    currentPage === i + 1
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próximo
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Distribuição Completa de Ativos */}
      {showFullDistribution && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setShowFullDistribution(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={24} />
            </button>

            <h2 className="text-xl font-bold text-text-primary mb-4">
              Distribuição de Proventos Recebidos por Ativo
            </h2>

            {/* Grid com gráfico e lista */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex justify-center">
                <ResponsiveContainer width={280} height={280}>
                  <PieChart>
                    <Pie
                      data={allDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {allDistributionData.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div>
                <div className="mb-4">
                  <p className="text-xs text-text-secondary">Total Recebido</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {formatCurrency(allDistributionData.reduce((s, d) => s + d.value, 0))}
                  </p>
                </div>

                <div className="space-y-2 text-xs max-h-[500px] overflow-y-auto">
                  {allDistributionData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-text-secondary">{item.name}</span>
                      </span>
                      <span className="font-semibold text-text-primary">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Distribuição por Mês */}
      {selectedMonth && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setSelectedMonth(null)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={24} />
            </button>

            <h2 className="text-xl font-bold text-text-primary mb-4">
              Distribuição de proventos em {selectedMonth}
            </h2>

            {/* Toggle */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-1 bg-bg-primary rounded-lg p-1 border border-border">
                <button
                  onClick={() => setModalDistributionType('ticker')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    modalDistributionType === 'ticker'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Por Ativo
                </button>
                <button
                  onClick={() => setModalDistributionType('type')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    modalDistributionType === 'type'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Por Tipo
                </button>
              </div>
            </div>

            {/* Gráfico e Lista */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex justify-center">
                <ResponsiveContainer width={280} height={280}>
                  <PieChart>
                    <Pie
                      data={modalDistributionType === 'ticker' ? modalData.tickerData : modalData.typeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {(modalDistributionType === 'ticker' ? modalData.tickerData : modalData.typeData).map((_, i) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div>
                <div className="mb-4">
                  <p className="text-xs text-text-secondary">Total</p>
                  <p className="text-2xl font-bold text-blue-400">{formatCurrency(modalData.total)}</p>
                </div>

                <div className="space-y-2 text-xs">
                  {(modalDistributionType === 'ticker' ? modalData.tickerData : modalData.typeData).map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-text-secondary">{item.name}</span>
                      </span>
                      <span className="font-semibold text-text-primary">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  )
}
