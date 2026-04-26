'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { stockAnalysisApi, priceHistoryApi } from '@/lib/api'
import { TickerInput } from '@/components/ui/TickerInput'
import { formatCurrency } from '@/lib/formatters'
import {
  ExternalLink, TrendingUp, TrendingDown,
  Building2, FileText, LayoutGrid, Tag, Target, Settings2,
  Clock, BarChart3, Users, Coins, DollarSign, Landmark, Wallet,
} from 'lucide-react'
import {
  AreaChart, Area,
  Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type AnalysisData = Awaited<ReturnType<typeof stockAnalysisApi.get>>

// ─── Helpers visuais ──────────────────────────────────────────────────────────
const fmt = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const fmtBi = (v: number | null | undefined) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return (v / 1e12).toFixed(1) + 'T'
  if (abs >= 1e9)  return (v / 1e9).toFixed(1) + 'B'
  if (abs >= 1e6)  return (v / 1e6).toFixed(1) + 'M'
  return v.toFixed(0)
}


function IndCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bg-primary rounded-lg p-3 border border-border">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-sm font-bold text-text-primary">{value}</p>
      {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
    </div>
  )
}

const PERIOD_OPTIONS = [
  { value: '1d',  label: '1 Dia'   },
  { value: '7d',  label: '7 Dias'  },
  { value: '1mo', label: '30 Dias' },
  { value: '6mo', label: '6 Meses' },
  { value: 'ytd', label: 'YTD'     },
  { value: '1y',  label: '1 Ano'   },
  { value: '5y',  label: '5 Anos'  },
]

// Formata YYYY-MM-DD → DD/MM/AA para exibição no eixo X e tooltip
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

// ─── Tooltip customizado para cotação ────────────────────────────────────────
const PriceTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-border rounded-lg p-3 text-sm shadow-xl">
      <p className="text-text-muted mb-1">{fmtDate(label)}</p>
      <p className="text-text-primary font-bold">{formatCurrency(payload[0]?.value)}</p>
    </div>
  )
}

// ─── Busca de ticker ──────────────────────────────────────────────────────────
function TickerSearch({ onSearch }: { onSearch: (t: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form onSubmit={e => { e.preventDefault(); if (value.trim()) onSearch(value.trim()) }}
      className="flex gap-2">
      <div className="flex-1">
        <TickerInput
          value={value}
          onChange={v => setValue(v)}
          onSelect={r => onSearch(r.ticker)}
          placeholder="Digite o ticker (ex: VALE3)"
          minChars={3}
          className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent text-sm font-medium"
        />
      </div>
      <button type="submit"
        className="bg-accent text-white px-6 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
        Analisar
      </button>
    </form>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────
function StockAnalysisContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [chartPeriod, setChartPeriod] = useState('1y')
  const [dailyHistory, setDailyHistory] = useState<{ date: string; close: number }[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dyPeriod, setDyPeriod] = useState<'5y' | '10y'>('10y')
  const [payoutPeriod, setPayoutPeriod] = useState<'5y' | '10y'>('10y')
  const [revenuePeriod, setRevenuePeriod] = useState<'5y' | '10y'>('10y')
  const [lpaPeriod, setLpaPeriod] = useState<'5y' | '10y'>('10y')
  const [comPage, setComPage] = useState(1)

  const ticker = searchParams.get('ticker')?.toUpperCase() ?? ''

  const loadTicker = useCallback(async (t: string) => {
    if (!t) return
    setLoading(true)
    setError('')
    setData(null)
    try {
      const d = await stockAnalysisApi.get(t)
      setData(d)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Ação não encontrada ou erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (ticker) loadTicker(ticker) }, [ticker])

  // Busca histórico diário/semanal sempre que ticker ou período mudam
  useEffect(() => {
    if (!ticker) return
    setDailyLoading(true)
    priceHistoryApi.get(ticker, chartPeriod)
      .then(r => setDailyHistory(r.data))
      .catch(() => setDailyHistory([]))
      .finally(() => setDailyLoading(false))
  }, [ticker, chartPeriod])

  const handleSearch = (t: string) => {
    router.push(`/stock-analysis?ticker=${t}`)
  }

  const { quote, profile, rentabilidade, fundamentals, fundamentalsHistory,
    incomeHistory, lpaVsPrice, dividendsPerYear, payoutByYear,
    dividends, comunicados, comunicadosUrl, fiiInfo } = data ?? {} as any

  const displayPrice = quote?.price ?? 0
  const changePos = (quote?.changePct ?? 0) >= 0

  return (
    <AppLayout>
      <div>
        {/* Cabeçalho + busca */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text-primary mb-1">Análise de Ações</h1>
          <p className="text-text-secondary text-sm mb-4">Dados fundamentalistas e histórico de qualquer ação</p>
          <TickerSearch onSearch={handleSearch} />
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-text-secondary text-sm animate-pulse">Carregando análise de {ticker}...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-400 text-sm">{error}</div>
        )}

        {!ticker && !loading && !data && (
          <div className="flex items-center justify-center h-48 text-text-muted text-sm">
            Digite um ticker acima para começar a análise
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">

            {/* ── Cabeçalho da ação ── */}
            <Card className="flex flex-wrap items-center gap-4">
              {profile?.logoUrl && (
                <img src={profile.logoUrl} alt={profile.ticker} className="w-12 h-12 rounded-lg object-contain bg-white p-1" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-text-primary">{profile?.ticker}</span>
                  <span className="text-text-muted text-sm">·</span>
                  <span className="text-text-secondary text-sm truncate">{profile?.name}</span>
                  {profile?.sector && (
                    <span className="bg-accent/15 text-accent text-xs px-2 py-0.5 rounded-full">{profile.sector}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-2xl font-bold text-text-primary">{formatCurrency(displayPrice)}</span>
                  <span className={`flex items-center gap-1 text-sm font-semibold ${changePos ? 'text-green-400' : 'text-red-400'}`}>
                    {changePos ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                    {changePos ? '+' : ''}{fmt(quote?.changePct)}% hoje
                  </span>
                  {quote?.marketCap && (
                    <span className="text-xs text-text-muted">Market Cap: R$ {fmtBi(quote.marketCap)}</span>
                  )}
                  {quote?.fiftyTwoWeekLow && quote?.fiftyTwoWeekHigh && (
                    <span className="text-xs text-text-muted">
                      52s: {formatCurrency(quote.fiftyTwoWeekLow)} – {formatCurrency(quote.fiftyTwoWeekHigh)}
                    </span>
                  )}
                </div>
              </div>
              {profile?.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline flex items-center gap-1">
                  Site <ExternalLink size={11} />
                </a>
              )}
            </Card>

            {/* ── KPI Cards FII ── */}
            {fiiInfo && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">{ticker} Cotação</p>
                  <p className="text-2xl font-bold text-text-primary mt-1.5">{formatCurrency(displayPrice)}</p>
                </Card>
                <Card>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">{ticker} DY (12M)</p>
                  <p className="text-2xl font-bold text-text-primary mt-1.5">
                    {fiiInfo.dy != null ? `${fmt(fiiInfo.dy)}%` : '—'}
                  </p>
                </Card>
                <Card>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">P/VP</p>
                  <p className="text-2xl font-bold text-text-primary mt-1.5">
                    {fiiInfo.pvp != null ? fmt(fiiInfo.pvp) : '—'}
                  </p>
                </Card>
                <Card>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">Liquidez Diária</p>
                  <p className="text-2xl font-bold text-text-primary mt-1.5">
                    {profile?.avgDailyLiquidity != null
                      ? `R$ ${(profile.avgDailyLiquidity / 1e6).toFixed(2).replace('.', ',')} M`
                      : '—'}
                  </p>
                </Card>
                <Card>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">Variação (12M)</p>
                  {(() => {
                    const val12m = (rentabilidade as any)?.['12m'] ?? null
                    const pos = val12m != null && val12m >= 0
                    return (
                      <p className={`text-2xl font-bold mt-1.5 ${val12m == null ? 'text-text-primary' : pos ? 'text-green-400' : 'text-red-400'}`}>
                        {val12m != null ? `${fmt(val12m)}% ${pos ? '↑' : '↓'}` : '—'}
                      </p>
                    )
                  })()}
                </Card>
              </div>
            )}

            {/* ── Rentabilidade + Gráfico cotação ── */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              <Card className="lg:col-span-1">
                <h2 className="text-base font-semibold text-text-primary mb-3">Rentabilidade</h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '1 mês',    key: '1m' },
                    { label: '3 meses',  key: '3m' },
                    { label: '6 meses',  key: '6m' },
                    { label: '12 meses', key: '12m' },
                    { label: '2 anos',   key: '24m' },
                    { label: '5 anos',   key: '60m' },
                  ].map(({ label, key }) => {
                    const val: number | null = (rentabilidade as any)?.[key] ?? null
                    const pos = val == null ? null : val >= 0
                    return (
                      <div key={key}
                        className={`rounded-lg p-2.5 border flex flex-col gap-1 ${
                          pos === true  ? 'bg-green-500/8 border-green-500/20' :
                          pos === false ? 'bg-red-500/8 border-red-500/20' :
                                          'bg-bg-primary border-border'
                        }`}>
                        <span className="text-xs text-text-muted leading-none">{label}</span>
                        <span className={`text-base font-bold leading-none ${
                          pos === true ? 'text-green-400' : pos === false ? 'text-red-400' : 'text-text-muted'
                        }`}>
                          {val == null ? '—' : `${val >= 0 ? '+' : ''}${fmt(val)}%`}
                        </span>
                        <div className="h-1 rounded-full bg-bg-hover overflow-hidden">
                          {val != null && (
                            <div
                              className={`h-full rounded-full ${pos ? 'bg-green-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(Math.abs(val), 100)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card className="lg:col-span-3">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-text-primary">Cotação Histórica</h2>
                  <div className="flex gap-1">
                    {PERIOD_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setChartPeriod(opt.value)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          chartPeriod === opt.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary bg-bg-primary'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {dailyLoading && (
                  <div className="h-[240px] flex items-center justify-center text-text-muted text-xs animate-pulse">
                    Carregando cotação...
                  </div>
                )}
                {!dailyLoading && (() => {
                  const prices = dailyHistory.map(p => p.close).filter(v => v > 0)
                  const minP = prices.length ? Math.min(...prices) : 0
                  const maxP = prices.length ? Math.max(...prices) : 0
                  const pad  = (maxP - minP) * 0.03 || maxP * 0.03
                  const yMin = Math.floor((minP - pad) * 100) / 100
                  const yMax = Math.ceil((maxP + pad) * 100) / 100
                  const minEntry = dailyHistory.find(p => p.close === minP)
                  const maxEntry = dailyHistory.find(p => p.close === maxP)
                  return (
                    <>
                      {prices.length > 0 && (
                        <div className="flex items-center gap-4 mb-3 text-xs">
                          <span className="flex items-center gap-1.5 text-green-400">
                            <span className="font-semibold">Máx</span>
                            <span className="font-bold">{formatCurrency(maxP)}</span>
                            {maxEntry && <span className="text-text-muted">({fmtDate(maxEntry.date)})</span>}
                          </span>
                          <span className="text-border">|</span>
                          <span className="flex items-center gap-1.5 text-red-400">
                            <span className="font-semibold">Mín</span>
                            <span className="font-bold">{formatCurrency(minP)}</span>
                            {minEntry && <span className="text-text-muted">({fmtDate(minEntry.date)})</span>}
                          </span>
                        </div>
                      )}
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={dailyHistory} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                          <defs>
                            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                            axisLine={false} tickLine={false}
                            tickFormatter={fmtDate} interval="preserveStartEnd" />
                          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                            tickFormatter={v => `R$${v.toFixed(0)}`} width={52}
                            domain={[yMin, yMax]} />
                          <Tooltip content={<PriceTooltip />} />
                          <Area type="monotone" dataKey="close" stroke="var(--accent)"
                            strokeWidth={2} fill="url(#priceGradient)" dot={false}
                            activeDot={{ r: 4, fill: 'var(--accent)' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  )
                })()}
              </Card>
            </div>

            {/* ── Indicadores Fundamentalistas / Informações FII ── */}
            {fiiInfo ? (
              <Card>
                <h2 className="text-base font-bold text-text-primary uppercase tracking-wide mb-4">
                  Informações sobre {ticker}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {([
                    { icon: Building2,   label: 'Nome',                value: fiiInfo.name },
                    { icon: FileText,    label: 'CNPJ',               value: fiiInfo.cnpj },
                    { icon: LayoutGrid,  label: 'Segmento',           value: fiiInfo.segment },
                    { icon: Tag,         label: 'Categoria',          value: fiiInfo.category },
                    { icon: Target,      label: 'Tipo',               value: fiiInfo.type },
                    { icon: Settings2,   label: 'Gestão',             value: fiiInfo.management },
                    { icon: Clock,       label: 'Mandato',            value: fiiInfo.mandate },
                    { icon: BarChart3,   label: 'Dividend Yield',     value: fiiInfo.dy != null ? `${fmt(fiiInfo.dy)}%` : null },
                    { icon: DollarSign,  label: 'VPA',                value: fiiInfo.vpa != null ? formatCurrency(fiiInfo.vpa) : null },
                    { icon: Coins,       label: 'Último Dividendo',   value: fiiInfo.lastDividend != null ? formatCurrency(fiiInfo.lastDividend) : null },
                    { icon: Landmark,    label: 'P/VP',               value: fiiInfo.pvp != null ? fmt(fiiInfo.pvp) : null },
                    { icon: Users,       label: 'Número de Cotistas',  value: fiiInfo.totalCotistas != null ? Number(fiiInfo.totalCotistas).toLocaleString('pt-BR') : null },
                    { icon: Coins,       label: 'Cotas Emitidas',     value: fiiInfo.sharesOutstanding != null ? Number(fiiInfo.sharesOutstanding).toLocaleString('pt-BR') : null },
                    { icon: Wallet,      label: 'Patrimônio Líquido', value: fiiInfo.equity != null ? (() => {
                        const v = Number(fiiInfo.equity)
                        if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(2).replace('.', ',')} Bilhões`
                        if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2).replace('.', ',')} Milhões`
                        return formatCurrency(v)
                      })() : null },
                    { icon: Landmark,    label: 'Ativos Totais',      value: fiiInfo.totalAssets != null ? (() => {
                        const v = Number(fiiInfo.totalAssets)
                        if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(2).replace('.', ',')} Bilhões`
                        if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2).replace('.', ',')} Milhões`
                        return formatCurrency(v)
                      })() : null },
                  ] as { icon: any; label: string; value: string | null }[])
                    .filter(item => item.value != null)
                    .map(item => (
                      <div key={item.label} className="flex items-center gap-3 py-2 border-b border-border/50">
                        <item.icon size={16} className="text-accent shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-text-muted block">{item.label}</span>
                          <span className="text-sm font-bold text-text-primary uppercase">{item.value}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            ) : fundamentals ? (
              <Card>
                <h2 className="text-base font-semibold text-text-primary mb-4">Indicadores Fundamentalistas</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  <IndCard label="P/L"          value={fmt(fundamentals.pl)} hint="Preço / Lucro" />
                  <IndCard label="P/VP"         value={fmt(fundamentals.pvp)} hint="Preço / Val. Patrimonial" />
                  <IndCard label="DY"           value={fundamentals.dy != null ? `${fmt(fundamentals.dy)}%` : '—'} hint="Dividend Yield" />
                  <IndCard label="ROE"          value={fundamentals.roe != null ? `${fmt(fundamentals.roe)}%` : '—'} hint="Retorno s/ PL" />
                  <IndCard label="ROA"          value={fundamentals.roa != null ? `${fmt(fundamentals.roa)}%` : '—'} hint="Retorno s/ Ativo" />
                  <IndCard label="LPA"          value={fundamentals.lpa != null ? formatCurrency(fundamentals.lpa) : '—'} hint="Lucro Por Ação" />
                  <IndCard label="VPA"          value={fundamentals.vpa != null ? formatCurrency(fundamentals.vpa) : '—'} hint="Val. Patrim. Por Ação" />
                  <IndCard label="EV/EBITDA"    value={fmt(fundamentals.evEbitda)} />
                  <IndCard label="EV/Receita"   value={fmt(fundamentals.evReceita)} />
                  <IndCard label="Marg. Líquida" value={fundamentals.margemLiquida != null ? `${fmt(fundamentals.margemLiquida)}%` : '—'} />
                  <IndCard label="Marg. Bruta"  value={fundamentals.margemBruta != null ? `${fmt(fundamentals.margemBruta)}%` : '—'} />
                  <IndCard label="Marg. EBIT"   value={fundamentals.margemEbit != null ? `${fmt(fundamentals.margemEbit)}%` : '—'} />
                  <IndCard label="Marg. EBITDA" value={fundamentals.margemEbitda != null ? `${fmt(fundamentals.margemEbitda)}%` : '—'} />
                  <IndCard label="Liq. Corrente" value={fmt(fundamentals.liquidezCorrente)} />
                  <IndCard label="Dívi. Líq/PL" value={fmt(fundamentals.dividaLiquidaPatrimonio)} />
                </div>
              </Card>
            ) : null}

            {/* ── Histórico de Indicadores ── */}
            {fundamentalsHistory && fundamentalsHistory.length > 0 && (
              <Card className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-base font-semibold text-text-primary">Histórico de Indicadores</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-primary">
                        {['Ano','P/L','P/VP','LPA','VPA','DY%','Marg.Líq%','Cotação'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider text-right first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...fundamentalsHistory].reverse().map(row => (
                        <tr key={row.year} className="border-b border-border hover:bg-bg-hover transition-colors">
                          <td className="px-4 py-2.5 text-base font-semibold text-text-primary">{row.year}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{fmt(row.pl)}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{fmt(row.pvp)}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{row.lpa != null ? formatCurrency(row.lpa) : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{row.vpa != null ? formatCurrency(row.vpa) : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{row.dy != null ? `${fmt(row.dy)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{row.margemLiquida != null ? `${fmt(row.margemLiquida)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-text-secondary">{row.price != null ? formatCurrency(row.price) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── Dividendos + Payout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {dividendsPerYear && dividendsPerYear.length > 0 && (() => {
                // DY% calculado no backend: dividendos_pagos_no_ano / preço_fim_do_ano (ambos da brapi)
                const dyAll = dividendsPerYear.filter(d => d.dy != null) as { year: string; dy: number; total: number }[]
                const currentYear = new Date().getFullYear()
                const ytdTotal = (dividends ?? [])
                  .filter(d => d.payDate?.startsWith(String(currentYear)))
                  .reduce((s, d) => s + d.value, 0)
                const dyYtd = ytdTotal > 0 && quote?.price && quote.price > 0
                  ? Math.round((ytdTotal / quote.price) * 10000) / 100
                  : null
                // injeta barra do ano atual se ainda não existir em dyAll (dividendos agrupados por exDate)
                const hasCurrentYear = dyAll.some(d => parseInt(d.year) === currentYear)
                const dyAllWithCurrent = (dyYtd != null && !hasCurrentYear)
                  ? [...dyAll, { year: String(currentYear), dy: dyYtd, total: ytdTotal }]
                  : dyAll
                const dyByYear = dyAllWithCurrent.filter(d => parseInt(d.year) >= currentYear - (dyPeriod === '5y' ? 5 : 10))
                const dy5yAvg = (() => {
                  const last5 = dyAll.filter(d => parseInt(d.year) >= currentYear - 5 && parseInt(d.year) < currentYear)
                  if (last5.length === 0) return null
                  return last5.reduce((s, d) => s + d.dy, 0) / last5.length
                })()
                return (
                <Card className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-semibold text-text-primary">Dividend Yield por Ano (%)</h2>
                    <div className="flex gap-1">
                      {([['5y','5 Anos'],['10y','10 Anos']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setDyPeriod(v)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            dyPeriod === v ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary bg-bg-primary'
                          }`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 mb-3">
                    {dyYtd != null && (
                      <div className="flex-1 bg-bg-primary rounded-lg px-3 py-2">
                        <p className="text-xs text-text-muted mb-0.5">DY {currentYear}</p>
                        <p className="text-sm font-bold text-green-400">{fmt(dyYtd)}%</p>
                      </div>
                    )}
                    {dy5yAvg != null && (
                      <div className="flex-1 bg-bg-primary rounded-lg px-3 py-2">
                        <p className="text-xs text-text-muted mb-0.5">Média 5 anos</p>
                        <p className="text-sm font-bold text-yellow-400">{fmt(dy5yAvg)}%</p>
                      </div>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={dyByYear} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `${v.toFixed(1)}%`} width={44} />
                      <Tooltip formatter={(v: any, _: any, props: any) => [
                        `${fmt(v)}% (${formatCurrency(props.payload?.total)}/ação)`, 'DY'
                      ]} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="dy" fill="#3fb950" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {dividends && dividends.length > 0 && (
                    <div className="mt-4 max-h-44 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-bg-secondary">
                          <tr className="border-b border-border">
                            <th className="pb-2 text-left text-text-muted font-medium">Data Com</th>
                            <th className="pb-2 text-left text-text-muted font-medium">Pagamento</th>
                            <th className="pb-2 text-left text-text-muted font-medium">Tipo</th>
                            <th className="pb-2 text-right text-text-muted font-medium">Valor/ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dividends.slice(0, 30).map((d, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-1.5 text-text-secondary">{d.exDate ? new Date(d.exDate).toLocaleDateString('pt-BR') : '—'}</td>
                              <td className="py-1.5 text-text-secondary">{d.payDate ? new Date(d.payDate).toLocaleDateString('pt-BR') : '—'}</td>
                              <td className="py-1.5 text-text-muted">{d.type}</td>
                              <td className="py-1.5 text-right font-semibold text-green-400">R$ {d.value.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                )
              })()}

              {/* ── Payout (ao lado do DY) ── */}
              {payoutByYear && incomeHistory && (() => {
                const dyByYearMap = new Map((dividendsPerYear ?? []).map(d => [d.year, d.dy]))
                const currentYearPayout = new Date().getFullYear()
                const payoutDataAll = incomeHistory
                  .map(inc => {
                    const py = payoutByYear.find(p => p.year === inc.year)
                    return {
                      year: inc.year,
                      netIncome: inc.netIncome,
                      payout: py?.payout ?? null,
                      dy: dyByYearMap.get(inc.year) ?? null,
                    }
                  })
                  .filter(d => d.netIncome != null || d.payout != null)
                const payoutData = payoutDataAll.filter(
                  d => parseInt(d.year) >= currentYearPayout - (payoutPeriod === '5y' ? 5 : 10)
                )
                if (payoutData.length === 0) return null
                return (
                <Card className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-semibold text-text-primary">Payout</h2>
                    <div className="flex gap-1">
                      {([['5y','5 Anos'],['10y','10 Anos']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setPayoutPeriod(v)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            payoutPeriod === v ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary bg-bg-primary'
                          }`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-4 mb-3 text-xs">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#3b4f6b]" />Lucro Líquido</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-[#3fb950]" />Payout</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-[#e3b341]" />DY</span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={payoutData} margin={{ top: 5, right: 40, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                          tickFormatter={v => fmtBi(v)} width={50} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                          tickFormatter={v => `${v}%`} width={36} />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          formatter={(v: any, name: string) => {
                            if (name === 'netIncome') return [fmtBi(v), 'Lucro Líquido']
                            if (name === 'payout')    return [`${fmt(v)}%`, 'Payout']
                            if (name === 'dy')        return [`${fmt(v)}%`, 'DY']
                            return [v, name]
                          }}
                        />
                        <ReferenceLine yAxisId="right" y={100} stroke="var(--text-muted)" strokeDasharray="4 4" />
                        <Bar yAxisId="left" dataKey="netIncome" fill="#3b4f6b" radius={[3, 3, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="payout" stroke="#3fb950" strokeWidth={2} dot={{ r: 3, fill: '#3fb950' }} connectNulls />
                        <Line yAxisId="right" type="monotone" dataKey="dy"     stroke="#e3b341" strokeWidth={2} dot={{ r: 3, fill: '#e3b341' }} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                )
              })()}

            </div>

            {/* ── Receita e Lucros ── */}
            {incomeHistory && incomeHistory.length > 0 && (() => {
              const currentYearR = new Date().getFullYear()
              const incomeFiltered = incomeHistory.filter(d => parseInt(d.year) >= currentYearR - (revenuePeriod === '5y' ? 5 : 10))
              return (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-text-primary">Receita × Lucro</h2>
                  <div className="flex gap-1">
                    {([['5y','5 Anos'],['10y','10 Anos']] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setRevenuePeriod(v)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          revenuePeriod === v ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary bg-bg-primary'
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={incomeFiltered} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => fmtBi(v)} width={52} />
                    <Tooltip
                      formatter={(v: any, name: string) => [fmtBi(v), name === 'revenue' ? 'Receita' : 'Lucro Líquido']}
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Legend formatter={v => v === 'revenue' ? 'Receita' : 'Lucro Líquido'}
                      wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 8 }} />
                    <Bar dataKey="revenue" name="revenue" fill="#58a6ff" radius={[3, 3, 0, 0]} opacity={0.85} />
                    <Line type="monotone" dataKey="netIncome" name="netIncome"
                      stroke="#3fb950" strokeWidth={2.5} dot={{ r: 3, fill: '#3fb950' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
              )
            })()}

            {/* ── Lucro × Cotação ── */}
            {lpaVsPrice && lpaVsPrice.filter(p => p.lpa != null).length > 0 && (() => {
              const currentYearL = new Date().getFullYear()
              const lpaFiltered = lpaVsPrice.filter(d => parseInt(d.year) >= currentYearL - (lpaPeriod === '5y' ? 5 : 10))
              return (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-text-primary">Lucro × Cotação</h2>
                  <div className="flex gap-1">
                    {([['5y','5 Anos'],['10y','10 Anos']] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setLpaPeriod(v)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          lpaPeriod === v ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary bg-bg-primary'
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={lpaFiltered} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="lpa" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `R$${v.toFixed(1)}`} width={52} />
                    <YAxis yAxisId="price" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                      axisLine={false} tickLine={false} tickFormatter={v => `R$${v.toFixed(0)}`} width={52} />
                    <Tooltip
                      formatter={(v: any, name: string) => [formatCurrency(v), name === 'lpa' ? 'LPA' : 'Cotação']}
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Legend formatter={v => v === 'lpa' ? 'LPA (eixo esq.)' : 'Cotação (eixo dir.)'}
                      wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 8 }} />
                    <Bar yAxisId="lpa" dataKey="lpa" name="lpa" fill="#3fb950" radius={[3, 3, 0, 0]} opacity={0.85} />
                    <Line yAxisId="price" type="monotone" dataKey="price" name="price"
                      stroke="#f78166" strokeWidth={2.5} dot={{ r: 3, fill: '#f78166' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
              )
            })()}

            {/* ── Comunicados ── */}
            {(() => {
              const PER_PAGE = 6
              const totalPages = comunicados ? Math.ceil(comunicados.length / PER_PAGE) : 0
              const paged = comunicados ? comunicados.slice((comPage - 1) * PER_PAGE, comPage * PER_PAGE) : []
              return (
              <Card className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-base font-semibold text-text-primary">
                    Comunicados do {ticker?.toUpperCase()}
                  </h2>
                  <a href={comunicadosUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-accent hover:underline">
                    Ver tudo no CVM <ExternalLink size={12} />
                  </a>
                </div>
                {paged.length > 0 ? (
                  <>
                    <div className="divide-y divide-border">
                      {paged.map((c, i) => (
                        <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-bg-hover transition-colors">
                          <span className="text-sm text-text-primary flex-1 mr-4">{c.category}{c.description ? ` – ${c.description}` : ''}</span>
                          <span className="text-xs text-text-muted whitespace-nowrap mr-4">{c.date}</span>
                          <a href={c.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 rounded border border-border text-xs font-medium text-text-primary hover:bg-bg-primary transition-colors whitespace-nowrap">
                            ABRIR <ExternalLink size={11} />
                          </a>
                        </div>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-1.5 px-5 py-3 border-t border-border">
                        <button onClick={() => setComPage((p: number) => Math.max(1, p - 1))} disabled={comPage === 1}
                          className="px-3 py-1.5 rounded border border-border text-xs text-text-secondary hover:bg-bg-primary disabled:opacity-40 transition-colors">
                          ‹ Anterior
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let page: number
                          if (totalPages <= 7) { page = i + 1 }
                          else if (comPage <= 4) { page = i + 1 }
                          else if (comPage >= totalPages - 3) { page = totalPages - 6 + i }
                          else { page = comPage - 3 + i }
                          return (
                            <button key={page} onClick={() => setComPage(page)}
                              className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                                comPage === page ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-primary'
                              }`}>{page}</button>
                          )
                        })}
                        <button onClick={() => setComPage((p: number) => Math.min(totalPages, p + 1))} disabled={comPage === totalPages}
                          className="px-3 py-1.5 rounded border border-border text-xs text-text-secondary hover:bg-bg-primary disabled:opacity-40 transition-colors">
                          Próxima ›
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-5 py-6 text-sm text-text-muted flex items-center justify-between">
                    <span>Comunicados disponíveis diretamente no portal da CVM</span>
                    <a href={comunicadosUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent hover:underline text-xs">
                      Acessar CVM <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </Card>
              )
            })()}

            {/* Dados e Informações sobre a empresa (oculto para FIIs) */}
            {profile && !fiiInfo && (() => {
              const fmtBrl = (v: number | null | undefined) => {
                if (v == null) return null
                const abs = Math.abs(v)
                if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(2).replace('.', ',')} Bilhões`
                if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(2).replace('.', ',')} Milhões`
                return `R$ ${v.toLocaleString('pt-BR')}`
              }
              const fmtNum = (v: number | null | undefined) => {
                if (v == null) return null
                if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2).replace('.', ',')} Bilhões`
                if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2).replace('.', ',')} Milhões`
                return v.toLocaleString('pt-BR')
              }

              const companyData: { label: string; value: string }[] = [
                ...(profile.name ? [{ label: 'Nome da Empresa', value: profile.name.replace(/ Pfd$| ON$| PN$/i, '') }] : []),
                ...(profile.cnpj ? [{ label: 'CNPJ', value: profile.cnpj }] : []),
                ...(profile.ipoYear ? [{ label: 'Ano de Estreia na Bolsa', value: String(profile.ipoYear) }] : []),
                ...(profile.employees ? [{ label: 'Nº de Funcionários', value: profile.employees.toLocaleString('pt-BR') }] : []),
                ...(profile.foundedYear ? [{ label: 'Ano de Fundação', value: String(profile.foundedYear) }] : []),
              ]

              const finData: { label: string; value: string }[] = [
                { label: 'Valor de Mercado', value: fmtBrl(profile.marketCap) },
                { label: 'Valor de Firma', value: fmtBrl(profile.enterpriseValue) },
                { label: 'Patrimônio Líquido', value: fmtBrl(profile.shareholdersEquity) },
                { label: 'Nº Total de Papéis', value: fmtNum(profile.sharesOutstanding) },
                { label: 'Ativos', value: fmtBrl(profile.totalAssets) },
                { label: 'Ativo Circulante', value: fmtBrl(profile.totalCurrentAssets) },
                { label: 'Dívida Bruta', value: fmtBrl(profile.grossDebt) },
                { label: 'Dívida Líquida', value: fmtBrl(profile.netDebt) },
                { label: 'Disponibilidade', value: fmtBrl(profile.totalCash) },
                ...(profile.listingSegment ? [{ label: 'Segmento de Listagem', value: profile.listingSegment }] : []),
                ...(profile.freeFloat != null ? [{ label: 'Free Float', value: `${profile.freeFloat.toFixed(2).replace('.', ',')}%` }] : []),
                { label: 'Liquidez Média Diária', value: fmtBrl(profile.avgDailyLiquidity) },
                ...(profile.sector ? [{ label: 'Setor', value: profile.sector }] : []),
                ...(profile.industry ? [{ label: 'Segmento', value: profile.industry }] : []),
              ].filter((i): i is { label: string; value: string } => i.value != null)

              return (
              <Card className="p-0 overflow-hidden">
                {/* ── Seção 1: Descrição ── */}
                {profile.description && (
                <div className="px-5 py-4">
                  <h2 className="text-base font-bold text-text-primary uppercase tracking-wide mb-3">Sobre a Empresa</h2>
                  <div>
                    {profile.logoUrl && (
                      <img src={profile.logoUrl} alt={profile.name ?? ''} className="w-28 h-28 rounded-xl object-contain bg-white p-3 float-left mr-4 mb-2" />
                    )}
                    <p className="text-sm text-text-secondary leading-relaxed">{profile.description}</p>
                  </div>
                </div>
                )}

                {/* ── Seção 2: Dados sobre a empresa ── */}
                <div className={`px-5 py-4 ${profile.description ? 'border-t border-border' : ''}`}>
                  <h2 className="text-base font-bold text-text-primary uppercase tracking-wide mb-4">Dados Sobre a Empresa</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3">
                    {companyData.map(item => (
                      <div key={item.label}>
                        <span className="text-sm text-text-muted block">{item.label}</span>
                        <span className="text-sm font-bold text-text-primary">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  {/* Papéis da empresa */}
                  {profile.otherCodes && profile.otherCodes.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <span className="text-sm text-text-muted block mb-1.5">Papéis da Empresa</span>
                      <div className="flex flex-wrap gap-2">
                        {profile.otherCodes.map(code => (
                          <span key={code} className="px-2.5 py-1 bg-bg-primary rounded text-xs font-semibold text-text-primary">{code}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.website && (
                    <div className="mt-3">
                      <a href={profile.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-accent hover:underline">
                        {profile.website} <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>

                {/* ── Seção 3: Informações financeiras ── */}
                {finData.length > 0 && (
                <div className="px-5 py-4 border-t border-border">
                  <h2 className="text-base font-bold text-text-primary uppercase tracking-wide mb-4">Informações Sobre a Empresa</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                    {finData.map(item => (
                      <div key={item.label}>
                        <span className="text-sm text-text-muted block">{item.label}</span>
                        <span className="text-sm font-bold text-text-primary">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </Card>
              )
            })()}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default function StockAnalysisPage() {
  return (
    <Suspense>
      <StockAnalysisContent />
    </Suspense>
  )
}
