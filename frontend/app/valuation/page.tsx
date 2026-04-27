'use client'
import { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { valuationApi, type PegyResult, type StockPegy } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { investidor10Url } from '@/lib/external'
import {
  Scale, TrendingUp, TrendingDown, Percent, Landmark,
  Search, ArrowUpDown, RefreshCw, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, Info,
} from 'lucide-react'

type SortKey = 'marketCap' | 'ticker' | 'pl' | 'dy' | 'cagrLucros5' | 'pegy' | 'pegyAjustado'
type SortDir = 'asc' | 'desc'
type SignalFilter = 'ALL' | 'PECHINCHA' | 'BARATA' | 'CARA' | 'ARMADILHA' | 'N/A'

const PAGE_SIZE = 25

const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PECHINCHA: { label: 'Pechincha', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  BARATA:    { label: 'Barata',    color: 'text-blue-400',  bg: 'bg-blue-500/10',  border: 'border-blue-500/30' },
  CARA:      { label: 'Cara',      color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  ARMADILHA: { label: 'Armadilha', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/30' },
}

function SignalBadge({ signal }: { signal: string | null }) {
  if (!signal) return <span className="text-text-muted text-xs">N/A</span>
  const cfg = SIGNAL_CONFIG[signal]
  if (!cfg) return <span className="text-text-muted text-xs">{signal}</span>
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      {signal === 'ARMADILHA' && <AlertTriangle size={10} />}
      {cfg.label}
    </span>
  )
}

function fmtMktCap(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + ' T'
  if (v >= 1e9) return (v / 1e9).toFixed(1) + ' B'
  if (v >= 1e6) return (v / 1e6).toFixed(0) + ' M'
  return formatNumber(v, 0)
}

function fmtVal(v: number | null, decimals = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return '-'
  return v.toFixed(decimals).replace('.', ',')
}

export default function ValuationPage() {
  const [data, setData] = useState<PegyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('marketCap')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filter, setFilter] = useState<SignalFilter>('ALL')
  const [pegyType, setPegyType] = useState<'traditional' | 'adjusted'>('adjusted')
  const [page, setPage] = useState(0)
  const [showFormulas, setShowFormulas] = useState(false)

  useEffect(() => {
    valuationApi.pegy()
      .then(setData)
      .catch(e => setError(e?.response?.data?.error ?? 'Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const result = await valuationApi.refresh()
      setData(result)
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Erro ao atualizar')
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.stocks

    // Filtro de busca
    if (search) {
      const q = search.toUpperCase()
      list = list.filter(s => s.ticker.includes(q) || s.companyName.toUpperCase().includes(q))
    }

    // Filtro de sinal
    if (filter !== 'ALL') {
      const signalKey = pegyType === 'adjusted' ? 'signalPegyAjustado' : 'signalPegy'
      if (filter === 'N/A') {
        list = list.filter(s => s[signalKey] === null)
      } else {
        list = list.filter(s => s[signalKey] === filter)
      }
    }

    // Ordenação
    list = [...list].sort((a, b) => {
      let va: number | null = null, vb: number | null = null
      if (sortKey === 'ticker') {
        return sortDir === 'asc' ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker)
      }
      if (sortKey === 'pegy') { va = a.pegy; vb = b.pegy }
      else if (sortKey === 'pegyAjustado') { va = a.pegyAjustado; vb = b.pegyAjustado }
      else { va = (a as any)[sortKey]; vb = (b as any)[sortKey] }

      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return list
  }, [data, search, filter, sortKey, sortDir, pegyType])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageStocks = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'ticker' ? 'asc' : 'desc') }
    setPage(0)
  }

  const SortHeader = ({ label, field, className }: { label: string; field: SortKey; className?: string }) => (
    <th
      onClick={() => toggleSort(field)}
      className={`px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider cursor-pointer hover:text-text-primary transition-colors select-none whitespace-nowrap ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        {sortKey === field && <ArrowUpDown size={10} className="text-accent" />}
      </span>
    </th>
  )

  // Contagens por sinal
  const signalCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>
    const key = pegyType === 'adjusted' ? 'signalPegyAjustado' : 'signalPegy'
    const counts: Record<string, number> = { PECHINCHA: 0, BARATA: 0, CARA: 0, ARMADILHA: 0, 'N/A': 0 }
    data.stocks.forEach(s => {
      const sig = s[key] ?? 'N/A'
      counts[sig] = (counts[sig] ?? 0) + 1
    })
    return counts
  }, [data, pegyType])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh] gap-3 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Carregando dados de Valuation...
        </div>
      </AppLayout>
    )
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-text-muted">
          <AlertTriangle size={28} className="text-red-400" />
          <p>{error ?? 'Erro desconhecido'}</p>
          <button onClick={handleRefresh} className="text-accent hover:underline text-sm">Tentar novamente</button>
        </div>
      </AppLayout>
    )
  }

  const { macro } = data

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Scale size={22} /> Valuation PEGY
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            PEGY Ratio de Peter Lynch adaptado ao cenário estrutural brasileiro
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Ref: {macro.dataRef}</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-primary border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Macro KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Percent size={14} className="text-yellow-400" />
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">IPCA (Média 5a)</p>
          </div>
          <p className="text-2xl font-bold text-yellow-400">{fmtVal(macro.ipca5yr)}%</p>
          <p className="text-[10px] text-text-muted mt-1">
            {macro.ipcaByYear.map(y => `${y.year}: ${y.value.toFixed(1)}%`).join(' | ')}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Landmark size={14} className="text-blue-400" />
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">DI / Selic (5a)</p>
          </div>
          <p className="text-2xl font-bold text-blue-400">{fmtVal(macro.di5yr)}%</p>
          <p className="text-[10px] text-text-muted mt-1">
            {macro.selicByYear.map(y => `${y.year}: ${y.value}%`).join(' | ')}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-red-400" />
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Juros Real</p>
          </div>
          <p className="text-2xl font-bold text-red-400">{fmtVal(macro.jurosReal)}%</p>
          <p className="text-[10px] text-text-muted mt-1">DI {fmtVal(macro.di5yr)}% - IPCA {fmtVal(macro.ipca5yr)}%</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Scale size={14} className="text-accent" />
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Empresas Analisadas</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{data.stocks.length}</p>
          <p className="text-[10px] text-text-muted mt-1">
            {data.stocks.filter(s => s.pegy !== null).length} com PEGY calculável
          </p>
        </Card>
      </div>

      {/* Formulas toggle */}
      <Card className="mb-6">
        <button
          onClick={() => setShowFormulas(!showFormulas)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors w-full"
        >
          <Info size={14} />
          <span className="font-medium">Metodologia de Cálculo</span>
          <span className="text-[10px] text-text-muted ml-auto">{showFormulas ? 'ocultar' : 'mostrar'}</span>
        </button>
        {showFormulas && (
          <div className="mt-4 grid md:grid-cols-2 gap-4 text-xs text-text-secondary">
            <div className="bg-bg-primary rounded-lg p-4 border border-border">
              <h3 className="text-sm font-bold text-text-primary mb-2">PEGY Tradicional (Peter Lynch)</h3>
              <p className="font-mono text-accent mb-2">PEGY = P/L / (CAGR Lucros + DY)</p>
              <ul className="space-y-1 text-text-muted">
                <li>P/L: Preço/Lucro últimos 12 meses</li>
                <li>CAGR: Crescimento composto lucros 5 anos</li>
                <li>DY: Dividend Yield últimos 12 meses</li>
              </ul>
            </div>
            <div className="bg-bg-primary rounded-lg p-4 border border-border">
              <h3 className="text-sm font-bold text-text-primary mb-2">PEGY Ajustado (Brasil)</h3>
              <p className="font-mono text-accent mb-2">PEGY = P/L / [(CAGR - IPCA) + DY - Juros Real]</p>
              <ul className="space-y-1 text-text-muted">
                <li>Crescimento Real: CAGR - IPCA médio 5a ({fmtVal(macro.ipca5yr)}%)</li>
                <li>Juros Real: DI 5a ({fmtVal(macro.di5yr)}%) - IPCA ({fmtVal(macro.ipca5yr)}%) = {fmtVal(macro.jurosReal)}%</li>
                <li>Desconta a renda fixa: se (CAGR + DY) {'<'} DI, melhor ficar no CDI</li>
              </ul>
            </div>
            <div className="md:col-span-2 bg-bg-primary rounded-lg p-4 border border-border">
              <h3 className="text-sm font-bold text-text-primary mb-2">Classificação</h3>
              <div className="flex flex-wrap gap-4">
                <span className="flex items-center gap-2"><SignalBadge signal="PECHINCHA" /> PEGY {'<'} 0,5 - Oportunidade rara</span>
                <span className="flex items-center gap-2"><SignalBadge signal="BARATA" /> PEGY 0,5 a 1,0 - Margem de segurança</span>
                <span className="flex items-center gap-2"><SignalBadge signal="CARA" /> PEGY {'>'} 1,0 - Sem oportunidade</span>
                <span className="flex items-center gap-2"><SignalBadge signal="ARMADILHA" /> PEGY negativo - Crescimento + dividendos não supera renda fixa</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar ticker ou empresa..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="w-full bg-bg-primary border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* PEGY type toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setPegyType('traditional'); setPage(0) }}
            className={`px-3 py-2 text-xs font-medium transition-colors ${pegyType === 'traditional' ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary hover:text-text-primary'}`}
          >
            Tradicional
          </button>
          <button
            onClick={() => { setPegyType('adjusted'); setPage(0) }}
            className={`px-3 py-2 text-xs font-medium transition-colors ${pegyType === 'adjusted' ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary hover:text-text-primary'}`}
          >
            Ajustado BR
          </button>
        </div>

        {/* Signal filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'PECHINCHA', 'BARATA', 'CARA', 'ARMADILHA', 'N/A'] as SignalFilter[]).map(sig => {
            const isActive = filter === sig
            const count = sig === 'ALL' ? data.stocks.length : signalCounts[sig] ?? 0
            const cfg = sig !== 'ALL' && sig !== 'N/A' ? SIGNAL_CONFIG[sig] : null
            return (
              <button
                key={sig}
                onClick={() => { setFilter(sig); setPage(0) }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                  isActive
                    ? 'bg-accent/15 text-accent border-accent/30'
                    : `bg-bg-primary ${cfg?.color ?? 'text-text-muted'} border-border hover:border-border`
                }`}
              >
                {sig === 'ALL' ? 'Todas' : sig === 'N/A' ? 'S/ dados' : cfg?.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-primary">
                <th className="px-3 py-3 text-left text-text-muted font-semibold text-[11px] uppercase tracking-wider w-6">#</th>
                <SortHeader label="Ticker" field="ticker" className="!text-left" />
                <SortHeader label="Preço" field="marketCap" />
                <SortHeader label="Valor Mercado" field="marketCap" />
                <SortHeader label="P/L" field="pl" />
                <SortHeader label="DY %" field="dy" />
                <SortHeader label="CAGR Lucros 5a" field="cagrLucros5" />
                <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                  Cresc. Real
                </th>
                <SortHeader label="PEGY" field="pegy" />
                <SortHeader label="PEGY Ajust." field="pegyAjustado" />
                <th className="px-3 py-3 text-center text-text-muted font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                  Sinal
                </th>
              </tr>
            </thead>
            <tbody>
              {pageStocks.map((s, i) => {
                const activeSignal = pegyType === 'adjusted' ? s.signalPegyAjustado : s.signalPegy
                const rowBg = activeSignal === 'PECHINCHA' ? 'bg-green-500/[0.03]'
                  : activeSignal === 'ARMADILHA' ? 'bg-red-500/[0.03]'
                  : ''
                return (
                  <tr key={s.ticker} className={`border-b border-border/50 hover:bg-bg-hover transition-colors ${rowBg}`}>
                    <td className="px-3 py-2.5 text-text-muted">{page * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2.5 text-left">
                      <a href={investidor10Url(s.ticker)} target="_blank" rel="noopener noreferrer" className="group block">
                        <span className="text-text-primary font-bold group-hover:text-accent transition-colors">{s.ticker}</span>
                        <p className="text-[10px] text-text-muted truncate max-w-[150px]">{s.companyName}</p>
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                      {formatCurrency(s.price)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                      {fmtMktCap(s.marketCap)}
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap ${s.pl !== null && s.pl < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                      {fmtVal(s.pl, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-400 whitespace-nowrap">
                      {fmtVal(s.dy, 2)}%
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${
                      s.cagrLucros5 !== null ? (s.cagrLucros5 >= 0 ? 'text-green-400' : 'text-red-400') : 'text-text-muted'
                    }`}>
                      {fmtVal(s.cagrLucros5, 1)}%
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap ${
                      s.crescimentoReal !== null ? (s.crescimentoReal >= 0 ? 'text-green-400' : 'text-red-400') : 'text-text-muted'
                    }`}>
                      {fmtVal(s.crescimentoReal, 1)}%
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-bold ${
                      s.pegy !== null
                        ? s.pegy < 0 ? 'text-red-400' : s.pegy <= 0.5 ? 'text-green-400' : s.pegy <= 1 ? 'text-blue-400' : 'text-yellow-400'
                        : 'text-text-muted'
                    }`}>
                      {fmtVal(s.pegy, 3)}
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-bold ${
                      s.pegyAjustado !== null
                        ? s.pegyAjustado < 0 ? 'text-red-400' : s.pegyAjustado <= 0.5 ? 'text-green-400' : s.pegyAjustado <= 1 ? 'text-blue-400' : 'text-yellow-400'
                        : 'text-text-muted'
                    }`}>
                      {fmtVal(s.pegyAjustado, 3)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SignalBadge signal={activeSignal} />
                    </td>
                  </tr>
                )
              })}
              {pageStocks.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-text-muted">
                    Nenhuma empresa encontrada com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-bg-primary">
            <span className="text-[11px] text-text-muted">
              {filtered.length} empresa{filtered.length !== 1 ? 's' : ''} &middot; Página {page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-bg-hover disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number
                if (totalPages <= 7) p = i
                else if (page < 3) p = i
                else if (page > totalPages - 4) p = totalPages - 7 + i
                else p = page - 3 + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      page === p ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-hover'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-bg-hover disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Legend footer */}
      <p className="text-[10px] text-text-muted mt-4 text-center">
        Fontes: StatusInvest (fundamentalista) &middot; BCB/SGS (IPCA) &middot; BCB/Focus (Selic) &middot; Cache: 1h &middot; Dados sujeitos a atraso
      </p>
    </AppLayout>
  )
}
