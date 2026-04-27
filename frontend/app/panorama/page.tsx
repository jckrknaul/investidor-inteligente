'use client'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { marketApi } from '@/lib/api'
import { useSession } from '@/lib/store'
import { formatNumber, formatCurrency } from '@/lib/formatters'
import { AssetLogo } from '@/components/ui/AssetLogo'
import { investidor10Url } from '@/lib/external'
import { Globe, RefreshCw, TrendingUp, TrendingDown, Info, ChevronLeft, ChevronRight, Briefcase, Crown, Search, Landmark } from 'lucide-react'

interface Quote {
  name: string
  symbol: string
  price: number | null
  change: number | null
  changePct: number | null
  flag?: string
}

const FLAG_MAP: Record<string, { code: string; emoji: string }> = {
  '🇧🇷': { code: 'br', emoji: '🇧🇷' },
  '🇺🇸': { code: 'us', emoji: '🇺🇸' },
  '🇨🇦': { code: 'ca', emoji: '🇨🇦' },
  '🇬🇧': { code: 'gb', emoji: '🇬🇧' },
  '🇩🇪': { code: 'de', emoji: '🇩🇪' },
  '🇫🇷': { code: 'fr', emoji: '🇫🇷' },
  '🇪🇺': { code: 'eu', emoji: '🇪🇺' },
  '🇪🇸': { code: 'es', emoji: '🇪🇸' },
  '🇨🇭': { code: 'ch', emoji: '🇨🇭' },
  '🇯🇵': { code: 'jp', emoji: '🇯🇵' },
  '🇭🇰': { code: 'hk', emoji: '🇭🇰' },
  '🇨🇳': { code: 'cn', emoji: '🇨🇳' },
  '🇰🇷': { code: 'kr', emoji: '🇰🇷' },
  '🇮🇳': { code: 'in', emoji: '🇮🇳' },
}

function FlagIcon({ flag, size = 18 }: { flag?: string; size?: number }) {
  if (!flag) return null
  const entry = FLAG_MAP[flag]
  if (entry) {
    return (
      <img
        src={`https://flagcdn.com/w40/${entry.code}.png`}
        alt={entry.emoji}
        width={size}
        height={Math.round(size * 0.75)}
        className="inline-block rounded-sm object-cover"
        style={{ minWidth: size }}
      />
    )
  }
  // Para ícones não-bandeira (🛢️, ₿)
  return <span className="text-sm">{flag}</span>
}

const HIGHLIGHT_DESCRIPTIONS: Record<string, string> = {
  '^BVSP': 'Índice Bovespa — principal indicador do mercado de ações brasileiro, composto pelas ações mais negociadas na B3.',
  '^GSPC': 'S&P 500 — índice das 500 maiores empresas listadas nas bolsas dos EUA, referência global de renda variável.',
  'DX-Y.NYB': 'Índice Dólar (DXY) — mede a força do dólar americano frente a uma cesta de 6 moedas (euro, iene, libra, etc.).',
  'BRL=X': 'Cotação do dólar americano em reais brasileiros. Impacta diretamente importações, exportações e investimentos no exterior.',
  'BZ=F': 'Petróleo Brent — referência internacional de preço do barril de petróleo, influencia inflação e ações do setor de energia.',
  'BTC-USD': 'Bitcoin — principal criptomoeda do mundo, referência do mercado cripto e ativo de proteção alternativo.',
}

function formatPrice(price: number): string {
  return formatNumber(price, 2)
}

function HighlightCard({ q }: { q: Quote }) {
  const positive = (q.changePct ?? 0) >= 0
  const description = HIGHLIGHT_DESCRIPTIONS[q.symbol]
  return (
    <div className="bg-bg-secondary border border-border rounded-xl px-5 py-4 min-w-[175px] flex-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-muted text-xs font-medium flex items-center gap-1.5">
          <FlagIcon flag={q.flag} size={16} />
          {q.name}
        </span>
        <div className="flex items-center gap-1.5">
          {description && (
            <div className="relative group">
              <Info size={13} className="text-text-muted/50 hover:text-accent cursor-help transition-colors" />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 px-4 py-3 rounded-lg bg-[#2d333b] border border-[#444c56] shadow-xl text-xs text-[#e6edf3] leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 pointer-events-none whitespace-normal break-words">
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#2d333b] border-l border-t border-[#444c56] rotate-45 translate-y-1" />
                {description}
              </div>
            </div>
          )}
          {positive ? (
            <TrendingUp size={14} className="text-green-400" />
          ) : (
            <TrendingDown size={14} className="text-red-400" />
          )}
        </div>
      </div>
      <div className="text-text-primary text-xl font-bold mb-1">
        {q.price != null ? formatPrice(q.price) : '–'}
      </div>
      <div className={`text-sm font-semibold ${positive ? 'text-green-400' : 'text-red-400'}`}>
        {q.changePct != null ? `${positive ? '+' : ''}${q.changePct.toFixed(2)}%` : '–'}
      </div>
    </div>
  )
}

function IndexTable({ title, items }: { title: string; items: Quote[] }) {
  return (
    <Card className="flex-1 min-w-[300px]">
      <h3 className="text-text-primary font-semibold text-sm mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Ativo</th>
              <th className="px-3 py-2 text-right">Últ. Preço</th>
              <th className="px-3 py-2 text-right">Var. (%)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((q) => {
              const positive = (q.changePct ?? 0) >= 0
              return (
                <tr
                  key={q.symbol}
                  className={`border-t border-border/50 transition-colors ${
                    positive
                      ? 'hover:bg-green-500/5'
                      : 'bg-red-500/[0.03] hover:bg-red-500/[0.08]'
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FlagIcon flag={q.flag} size={20} />
                      <span className="text-text-primary font-medium">{q.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
                    {q.price != null ? formatPrice(q.price) : '–'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        positive
                          ? 'text-green-400 bg-green-500/10'
                          : 'text-red-400 bg-red-500/10'
                      }`}
                    >
                      {q.changePct != null
                        ? `${positive ? '+' : ''}${q.changePct.toFixed(2)}%`
                        : '–'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

interface PortfolioQuote {
  ticker: string
  name: string
  price: number | null
  change: number | null
  changePct: number | null
  assetClass: string
}

interface TopStock {
  ticker: string
  name: string
  price: number
  changePct: number
  marketCap: number
  sector: string
  logo: string
}

const PAGE_SIZE = 15

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `R$ ${(value / 1e12).toFixed(1)} T`
  if (value >= 1e9) return `R$ ${(value / 1e9).toFixed(1)} B`
  if (value >= 1e6) return `R$ ${(value / 1e6).toFixed(1)} M`
  return formatCurrency(value)
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-3 border-t border-border/50">
      <span className="text-text-muted text-xs">
        Página {page} de {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
              p === page
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function PortfolioTable({ items }: { items: PortfolioQuote[] }) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const filtered = filter
    ? items.filter(q => q.ticker.toLowerCase().includes(filter.toLowerCase()))
    : items
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Briefcase size={16} className="text-accent" />
          <h3 className="text-text-primary font-semibold text-sm">Minha Carteira</h3>
          <span className="text-text-muted text-xs">({filtered.length} ativos)</span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filtrar ticker..."
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1) }}
            className="pl-8 pr-3 py-1.5 w-36 rounded-lg bg-bg-primary border border-border text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Ativo</th>
              <th className="px-3 py-2 text-right">Últ. Preço</th>
              <th className="px-3 py-2 text-right">Var. (%)</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(q => {
              const positive = (q.changePct ?? 0) >= 0
              return (
                <tr key={q.ticker} className={`border-t border-border/50 transition-colors ${
                  positive ? 'hover:bg-green-500/5' : 'bg-red-500/[0.03] hover:bg-red-500/[0.08]'
                }`}>
                  <td className="px-3 py-2.5">
                    <a href={investidor10Url(q.ticker, q.assetClass)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                      <AssetLogo ticker={q.ticker} size={22} />
                      <span className="text-text-primary font-medium group-hover:text-accent transition-colors">{q.ticker}</span>
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
                    {q.price != null ? formatCurrency(q.price) : '–'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      positive ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                    }`}>
                      {q.changePct != null ? `${positive ? '+' : ''}${q.changePct.toFixed(2)}%` : '–'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </Card>
  )
}

function TopBrStocksTable({ items }: { items: TopStock[] }) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const filtered = filter
    ? items.filter(s => s.ticker.toLowerCase().includes(filter.toLowerCase()) || s.name.toLowerCase().includes(filter.toLowerCase()))
    : items
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-yellow-400" />
          <h3 className="text-text-primary font-semibold text-sm">Maiores Ações Brasileiras</h3>
          <span className="text-text-muted text-xs">({filtered.length})</span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filtrar ticker..."
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1) }}
            className="pl-8 pr-3 py-1.5 w-36 rounded-lg bg-bg-primary border border-border text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Ativo</th>
              <th className="px-3 py-2 text-right">Últ. Preço</th>
              <th className="px-3 py-2 text-right">Var. (%)</th>
              <th className="px-3 py-2 text-right">Valor de Mercado</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s, i) => {
              const positive = s.changePct >= 0
              const rank = (page - 1) * PAGE_SIZE + i + 1
              return (
                <tr key={s.ticker} className={`border-t border-border/50 transition-colors ${
                  positive ? 'hover:bg-green-500/5' : 'bg-red-500/[0.03] hover:bg-red-500/[0.08]'
                }`}>
                  <td className="px-3 py-2.5 text-text-muted text-xs">{rank}</td>
                  <td className="px-3 py-2.5">
                    <a href={investidor10Url(s.ticker)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                      <AssetLogo ticker={s.ticker} size={22} />
                      <div>
                        <span className="text-text-primary font-medium group-hover:text-accent transition-colors">{s.ticker}</span>
                        <span className="text-text-muted text-xs ml-2 hidden lg:inline">{s.name.length > 25 ? s.name.slice(0, 25) + '…' : s.name}</span>
                      </div>
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
                    {formatCurrency(s.price)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      positive ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                    }`}>
                      {positive ? '+' : ''}{s.changePct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-secondary text-xs tabular-nums">
                    {formatMarketCap(s.marketCap)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </Card>
  )
}

interface TreasuryBond {
  tipo: string
  vencimento: string
  dataBase: string
  taxaCompra: number | null
  taxaVenda: number | null
  puCompra: number | null
  puVenda: number | null
}

const TREASURY_TYPE_ORDER: Record<string, number> = {
  'Tesouro Selic': 0,
  'Tesouro Prefixado': 1,
  'Tesouro Prefixado com Juros Semestrais': 2,
  'Tesouro IPCA+': 3,
  'Tesouro IPCA+ com Juros Semestrais': 4,
  'Tesouro Renda+ Aposentadoria Extra': 5,
  'Tesouro Educa+': 6,
  'Tesouro IGPM+ com Juros Semestrais': 7,
}

function TreasuryTable({ items }: { items: TreasuryBond[] }) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const sorted = [...items].sort((a, b) => {
    const oa = TREASURY_TYPE_ORDER[a.tipo] ?? 99
    const ob = TREASURY_TYPE_ORDER[b.tipo] ?? 99
    if (oa !== ob) return oa - ob
    return a.vencimento.localeCompare(b.vencimento)
  })
  const filtered = filter
    ? sorted.filter(b => b.tipo.toLowerCase().includes(filter.toLowerCase()) || b.vencimento.includes(filter))
    : sorted
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Group items to show type header when it changes
  let lastTipo = ''

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-accent" />
          <h3 className="text-text-primary font-semibold text-sm">Tesouro Direto</h3>
          <span className="text-text-muted text-xs">({filtered.length} títulos)</span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filtrar título..."
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1) }}
            className="pl-8 pr-3 py-1.5 w-44 rounded-lg bg-bg-primary border border-border text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Título</th>
              <th className="px-3 py-2 text-center">Vencimento</th>
              <th className="px-3 py-2 text-right">Taxa Compra</th>
              <th className="px-3 py-2 text-right">Taxa Venda</th>
              <th className="px-3 py-2 text-right">PU Compra</th>
              <th className="px-3 py-2 text-right">PU Venda</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((b, i) => {
              const showGroup = b.tipo !== lastTipo
              lastTipo = b.tipo
              return (
                <tr key={`${b.tipo}-${b.vencimento}-${i}`} className="border-t border-border/50 hover:bg-bg-hover transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      {showGroup && (
                        <span className="text-accent text-[10px] font-semibold uppercase tracking-wider mb-0.5">{b.tipo}</span>
                      )}
                      <span className="text-text-primary font-medium text-xs">
                        {b.tipo} {b.vencimento}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-text-secondary text-xs tabular-nums">{b.vencimento}</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
                    {b.taxaCompra != null ? `${b.taxaCompra.toFixed(2)}%` : '–'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
                    {b.taxaVenda != null ? `${b.taxaVenda.toFixed(2)}%` : '–'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-primary font-medium tabular-nums">
                    {b.puCompra != null ? formatCurrency(b.puCompra) : '–'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-primary font-medium tabular-nums">
                    {b.puVenda != null ? formatCurrency(b.puVenda) : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </Card>
  )
}

export default function PanoramaPage() {
  const { session } = useSession()
  const [data, setData] = useState<{
    highlights: Quote[]
    americas: Quote[]
    europe: Quote[]
    asia: Quote[]
  } | null>(null)
  const [portfolioQuotes, setPortfolioQuotes] = useState<PortfolioQuote[]>([])
  const [topStocks, setTopStocks] = useState<TopStock[]>([])
  const [treasury, setTreasury] = useState<TreasuryBond[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const walletId = typeof window !== 'undefined' ? localStorage.getItem('walletId') : null
      const [panorama, portfolio, top, treasuryData] = await Promise.all([
        marketApi.panorama(),
        walletId ? marketApi.portfolioQuotes(walletId) : Promise.resolve([]),
        marketApi.topBrStocks(),
        marketApi.treasury(),
      ])
      setData(panorama)
      setPortfolioQuotes(portfolio)
      setTopStocks(top)
      setTreasury(treasuryData)
    } catch {
      setError('Erro ao carregar dados do mercado')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-refresh a cada 5 minutos
  useEffect(() => {
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={24} className="text-accent" />
            <div>
              <h1 className="text-xl font-bold text-text-primary">Panorama do Mercado</h1>
              <p className="text-text-muted text-xs">
                Dados dos principais ativos e mercados globais
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-text-muted text-xs flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Atualização em tempo real, com até 15 minutos de atraso.
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-20 text-text-muted">
            <RefreshCw size={20} className="animate-spin mr-2" />
            Carregando dados do mercado...
          </div>
        ) : data ? (
          <>
            {/* Highlight cards */}
            <div className="flex flex-wrap gap-3">
              {data.highlights.map((q) => (
                <HighlightCard key={q.symbol} q={q} />
              ))}
            </div>

            {/* Tabelas de índices */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <IndexTable title="Índices – América" items={data.americas} />
              <IndexTable title="Índices – Europa" items={data.europe} />
              <IndexTable title="Índices – Ásia" items={data.asia} />
            </div>

            {/* Cotações da carteira + Maiores ações BR */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {portfolioQuotes.length > 0 && (
                <PortfolioTable items={portfolioQuotes} />
              )}
              {topStocks.length > 0 && (
                <TopBrStocksTable items={topStocks} />
              )}
            </div>

            {/* Tesouro Direto */}
            {treasury.length > 0 && (
              <TreasuryTable items={treasury} />
            )}
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
