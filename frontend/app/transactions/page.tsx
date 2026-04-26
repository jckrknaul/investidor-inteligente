'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { AssetClassBadge } from '@/components/ui/Badge'
import { AssetLogo } from '@/components/ui/AssetLogo'
import { TickerInput, isFIIResult } from '@/components/ui/TickerInput'
import { transactionsApi, quotesApi, marketApi } from '@/lib/api'
import { formatCurrency, formatDate, ASSET_CLASS_LABELS } from '@/lib/formatters'
import { Plus, Trash2, Pencil, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const ASSET_CLASSES = ['FII', 'STOCK', 'FIXED_INCOME', 'TREASURY', 'CRYPTO'] as const
const ITEMS_PER_PAGE = 20
const FII_SUBTYPES = ['Tijolo', 'Papel', 'Híbrido', 'FOF', 'Desenvolvimento']
const FIXED_INCOME_TYPES = ['CDB', 'LCI', 'LCA', 'LC', 'LF', 'Debênture', 'CRI', 'CRA']
const FIXED_INCOME_INDEXERS = ['CDI', 'IPCA', 'Prefixado', 'Selic']
const FIXED_INCOME_FORMS = ['Pós-fixado', 'Prefixado', 'Híbrido']

const EMPTY_FORM = {
  type: 'BUY' as 'BUY' | 'SELL',
  ticker: '',
  assetClass: 'STOCK' as string,
  subtype: '',
  date: new Date().toISOString().slice(0, 10),
  quantity: '',
  unitPrice: '',
  fees: '0',
  notes: '',
  // Renda Fixa
  issuer: '',
  indexer: 'CDI',
  rate: '',
  fixedForm: 'Pós-fixado',
  dailyLiquidity: false,
  maturityDate: '',
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [priceMsg, setPriceMsg] = useState('')
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [filterClass, setFilterClass] = useState('')
  const [filterTicker, setFilterTicker] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [walletId, setWalletId] = useState('')
  const [treasuryBonds, setTreasuryBonds] = useState<{ tipo: string; vencimento: string; puCompra: number | null }[]>([])
  const [chartView, setChartView] = useState<'mensal' | 'anual'>('mensal')
  const [chartClass, setChartClass] = useState('')
  const [chartPeriod, setChartPeriod] = useState<'all' | 'ytd' | '12m' | '2y' | '5y'>('ytd')

  useEffect(() => {
    setWalletId(localStorage.getItem('walletId') ?? '')
  }, [])

  const load = async () => {
    if (!walletId) return
    setLoading(true)
    try {
      const data = await transactionsApi.list(walletId)
      setTransactions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [walletId])

  // Carrega títulos do Tesouro Direto quando a classe é TREASURY
  useEffect(() => {
    if (form.assetClass === 'TREASURY' && open && treasuryBonds.length === 0) {
      marketApi.treasury().then(setTreasuryBonds).catch(() => {})
    }
  }, [form.assetClass, open])

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setPriceMsg('')
    lastFetchedRef.current = ''
    userEditedPriceRef.current = false
    setOpen(true)
  }

  const lastFetchedRef = useRef('')
  const userEditedPriceRef = useRef(false)

  const fetchPrice = async (ticker: string, date: string) => {
    if (!ticker || ticker.length < 3 || !date || editingId) return
    if (userEditedPriceRef.current) return
    const key = `${ticker}|${date}`
    if (lastFetchedRef.current === key) return
    lastFetchedRef.current = key
    setFetchingPrice(true)
    setPriceMsg('')
    try {
      const { price } = await quotesApi.get(ticker, date)
      setForm(f => ({ ...f, unitPrice: price.toFixed(2) }))
      setPriceMsg(`Cotação em ${date.split('-').reverse().join('/')}: R$ ${price.toFixed(2)}`)
    } catch {
      setPriceMsg('Cotação não encontrada — informe o preço manualmente')
      lastFetchedRef.current = ''
    } finally {
      setFetchingPrice(false)
    }
  }

  useEffect(() => {
    if (!open || editingId || !form.ticker || form.ticker.length < 3 || !form.date) return
    if (form.assetClass === 'FIXED_INCOME' || form.assetClass === 'TREASURY') return
    const t = setTimeout(() => fetchPrice(form.ticker, form.date), 400)
    return () => clearTimeout(t)
  }, [form.ticker, form.date, open, form.assetClass])

  // Auto-detecta FII pelo sufixo numérico ao digitar manualmente
  useEffect(() => {
    if (!open || editingId || form.ticker.length < 5) return
    if (form.assetClass === 'TREASURY') return
    if (/\d{2}$/.test(form.ticker) && form.assetClass !== 'FII') {
      setForm(f => ({ ...f, assetClass: 'FII', subtype: '' }))
    }
  }, [form.ticker, open])

  useEffect(() => {
    if (!open || editingId || form.assetClass !== 'FII' || form.ticker.length < 5) return
    quotesApi.segment(form.ticker)
      .then(({ segment }) => { if (segment) setForm(f => ({ ...f, subtype: segment })) })
      .catch(() => {})
  }, [form.ticker, form.assetClass, open])

  const openEdit = (tx: any) => {
    setEditingId(tx.id)
    setForm({
      ...EMPTY_FORM,
      type: tx.type,
      ticker: tx.asset?.ticker ?? '',
      assetClass: tx.asset?.assetClass ?? 'STOCK',
      subtype: tx.asset?.subtype ?? '',
      date: new Date(tx.date).toISOString().slice(0, 10),
      quantity: String(Number(tx.quantity)),
      unitPrice: String(Number(tx.unitPrice)),
      fees: String(Number(tx.fees)),
      notes: tx.notes ?? '',
    })
    setError('')
    userEditedPriceRef.current = false
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editingId) {
        await transactionsApi.update(editingId, {
          type: form.type,
          date: form.date,
          quantity: Number(form.quantity),
          unitPrice: Number(form.unitPrice),
          fees: Number(form.fees),
          notes: form.notes || undefined,
        })
      } else if (form.assetClass === 'FIXED_INCOME') {
        if (!form.issuer.trim()) throw new Error('Informe o emissor')
        if (!form.subtype) throw new Error('Selecione o tipo de título')
        if (!form.maturityDate) throw new Error('Informe a data de vencimento')
        const value = Number(form.unitPrice || 0)
        if (!value || value <= 0) throw new Error('Informe o valor investido')
        const slug = form.issuer.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 20)
        const dateCompact = form.date.replace(/-/g, '')
        const uniq = Date.now().toString(36).slice(-5).toUpperCase()
        const ticker = `${slug}-${form.subtype}-${dateCompact}-${uniq}`
        await transactionsApi.create(walletId, {
          type: form.type,
          ticker,
          assetClass: 'FIXED_INCOME',
          subtype: form.subtype,
          date: form.date,
          quantity: 1,
          unitPrice: value,
          fees: 0,
          issuer: form.issuer.trim(),
          indexer: form.indexer || undefined,
          rate: form.rate ? Number(form.rate) : undefined,
          fixedForm: form.fixedForm || undefined,
          dailyLiquidity: form.dailyLiquidity,
          maturityDate: form.maturityDate,
        })
      } else {
        const detectedClass = (form.assetClass !== 'TREASURY' && /\d{2}$/.test(form.ticker)) ? 'FII' : form.assetClass
        await transactionsApi.create(walletId, {
          type: form.type,
          ticker: form.ticker,
          assetClass: detectedClass,
          subtype: form.subtype || undefined,
          date: form.date,
          quantity: Number(form.quantity),
          unitPrice: Number(form.unitPrice),
          fees: Number(form.fees),
          notes: form.notes || undefined,
        })
      }
      setOpen(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      setCurrentPage(1)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Erro ao salvar lançamento')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    await transactionsApi.remove(confirmDelete)
    setConfirmDelete(null)
    await load()
  }

  const field = (key: string, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  // Dados do gráfico Compras x Vendas
  const chartData = useMemo(() => {
    const now = new Date()
    let cutoff: Date | null = null
    if (chartPeriod === 'ytd') cutoff = new Date(now.getFullYear(), 0, 1)
    else if (chartPeriod === '12m') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 12) }
    else if (chartPeriod === '2y') { cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 2) }
    else if (chartPeriod === '5y') { cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 5) }

    const filtered = transactions.filter(tx => {
      if (chartClass && tx.asset?.assetClass !== chartClass) return false
      if (cutoff && new Date(tx.date) < cutoff) return false
      return true
    })

    if (chartView === 'mensal') {
      // Build month slots from cutoff (or earliest tx) to now
      const earliest = filtered.length
        ? new Date(filtered.reduce((a, b) => new Date(a.date) < new Date(b.date) ? a : b).date)
        : now
      const startYear = (cutoff ?? earliest).getFullYear()
      const startMonth = (cutoff ?? earliest).getMonth()
      const slots = new Map<string, { label: string; Compras: number; Vendas: number }>()
      let y = startYear, m = startMonth
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
        const key = `${y}-${m}`
        slots.set(key, { label: new Date(y, m, 1).toLocaleString('pt-BR', { month: 'short' }).replace('.', ''), Compras: 0, Vendas: 0 })
        m++; if (m > 11) { m = 0; y++ }
      }
      filtered.forEach(tx => {
        const d = new Date(tx.date)
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
        const slot = slots.get(key)
        if (!slot) return
        const total = Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees)
        if (tx.type === 'BUY') slot.Compras += total
        else slot.Vendas -= total
      })
      return Array.from(slots.values())
    } else {
      const map = new Map<number, { Compras: number; Vendas: number }>()
      filtered.forEach(tx => {
        const year = new Date(tx.date).getUTCFullYear()
        if (!map.has(year)) map.set(year, { Compras: 0, Vendas: 0 })
        const total = Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees)
        const entry = map.get(year)!
        if (tx.type === 'BUY') entry.Compras += total
        else entry.Vendas -= total
      })
      return Array.from(map.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, v]) => ({ label: String(year), ...v }))
    }
  }, [transactions, chartView, chartClass, chartPeriod])

  // Opções de filtro
  const classOptions = useMemo(() =>
    [...new Set(transactions.map(t => t.asset?.assetClass).filter(Boolean))].sort()
  , [transactions])

  const tickerOptions = useMemo(() =>
    [...new Set(transactions.map(t => t.asset?.ticker).filter(Boolean))].sort()
  , [transactions])

  // Filtrar transações
  const filteredTransactions = useMemo(() =>
    transactions.filter(t => {
      if (filterClass && t.asset?.assetClass !== filterClass) return false
      if (filterTicker && t.asset?.ticker !== filterTicker) return false
      return true
    })
  , [transactions, filterClass, filterTicker])

  // Paginação
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
  const endIdx = startIdx + ITEMS_PER_PAGE
  const paginatedTransactions = filteredTransactions.slice(startIdx, endIdx)

  const handlePrevPage = () => setCurrentPage(p => Math.max(1, p - 1))
  const handleNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1))

  const handleFilterChange = (classFilter: string, tickerFilter: string) => {
    setFilterClass(classFilter)
    setFilterTicker(tickerFilter)
    setCurrentPage(1)
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Lançamentos</h1>
          <p className="text-text-secondary text-sm mt-0.5">Histórico de compras e vendas</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-accent hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Adicionar Lançamento
        </button>
      </div>

      {/* Gráfico Compras x Vendas */}
      {!loading && transactions.length > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Compras x Vendas</h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro por classe */}
              <select
                value={chartClass}
                onChange={e => setChartClass(e.target.value)}
                className="bg-bg-primary border border-border rounded-lg px-2 py-1.5 text-text-secondary text-xs focus:outline-none focus:border-accent"
              >
                <option value="">Todas as classes</option>
                {classOptions.map(c => (
                  <option key={c} value={c}>{ASSET_CLASS_LABELS[c as keyof typeof ASSET_CLASS_LABELS] ?? c}</option>
                ))}
              </select>
              {/* Filtro de período */}
              <div className="flex bg-bg-primary border border-border rounded-lg overflow-hidden text-xs">
                {([
                  { value: 'all', label: 'Tudo' },
                  { value: 'ytd', label: 'Ano atual' },
                  { value: '12m', label: '12M' },
                  { value: '2y', label: '2A' },
                  { value: '5y', label: '5A' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setChartPeriod(opt.value)}
                    className={`px-3 py-1.5 font-medium transition-colors ${
                      chartPeriod === opt.value ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Toggle Mensal / Anual */}
              <div className="flex bg-bg-primary border border-border rounded-lg overflow-hidden text-xs">
                {(['mensal', 'anual'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                      chartView === v ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="35%" stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => {
                  const abs = Math.abs(v)
                  return abs >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }}
                width={48}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                formatter={(v: number) => formatCurrency(Math.abs(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="Compras" stackId="a" fill="#3fb950" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Vendas" stackId="a" fill="#f85149" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filterClass}
          onChange={e => handleFilterChange(e.target.value, '')}
          className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
        >
          <option value="">Todas as classes</option>
          {classOptions.map(c => (
            <option key={c} value={c}>{ASSET_CLASS_LABELS[c as keyof typeof ASSET_CLASS_LABELS] ?? c}</option>
          ))}
        </select>

        <select
          value={filterTicker}
          onChange={e => handleFilterChange(filterClass, e.target.value)}
          className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
        >
          <option value="">Todos os ativos</option>
          {tickerOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {(filterClass || filterTicker) && (
          <button
            onClick={() => handleFilterChange('', '')}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors ml-2"
          >
            <X size={13} /> Limpar
          </button>
        )}

        <span className="ml-auto text-xs text-text-muted">
          {filteredTransactions.length} de {transactions.length} lançamentos
        </span>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm animate-pulse">
            Carregando...
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm gap-2">
            <p>Nenhum lançamento registrado.</p>
            <button onClick={openNew} className="text-accent hover:underline">
              Adicionar primeiro lançamento
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-text-muted text-sm">
            Nenhum lançamento com os filtros selecionados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Ativo</th>
                <th className="px-4 py-3 text-left">Classe</th>
                <th className="px-4 py-3 text-right">Data</th>
                <th className="px-4 py-3 text-right">Qtd</th>
                <th className="px-4 py-3 text-right">Preço Unit.</th>
                <th className="px-4 py-3 text-right">Taxas</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map((tx: any) => (
                <tr key={tx.id} className="border-t border-border hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      tx.type === 'BUY'
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}>
                      {tx.type === 'BUY' ? 'Compra' : 'Venda'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <AssetLogo ticker={tx.asset?.ticker ?? ''} size={26} />
                      <span className="font-semibold text-text-primary">{tx.asset?.ticker}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><AssetClassBadge cls={tx.asset?.assetClass} /></td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{Number(tx.quantity)}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(Number(tx.unitPrice))}</td>
                  <td className="px-4 py-3 text-right text-text-muted">{formatCurrency(Number(tx.fees))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">
                    {formatCurrency(Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(tx)}
                        className="text-text-muted hover:text-accent transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(tx.id)}
                        className="text-text-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Paginação */}
      {!loading && filteredTransactions.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between mt-4 px-4">
          <span className="text-xs text-text-muted">
            Mostrando {startIdx + 1} a {Math.min(endIdx, filteredTransactions.length)} de {filteredTransactions.length} lançamentos
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

      <Modal open={open} onClose={() => { setOpen(false); setEditingId(null) }} title={editingId ? 'Editar Lançamento' : 'Adicionar Lançamento'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => field('type', e.target.value as any)}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              >
                <option value="BUY">Compra</option>
                <option value="SELL">Venda</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Classe do Ativo</label>
              <select
                value={form.assetClass}
                onChange={e => setForm(f => ({ ...f, assetClass: e.target.value, ticker: '' }))}
                disabled={!!editingId}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ASSET_CLASSES.map(c => (
                  <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>

          {form.assetClass !== 'FIXED_INCOME' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    {form.assetClass === 'TREASURY' ? 'Título' : 'Ticker'}
                  </label>
                  {form.assetClass === 'TREASURY' ? (
                    <select
                      required
                      value={form.ticker}
                      onChange={e => {
                        const val = e.target.value
                        field('ticker', val)
                        // Preencher preço unitário com PU Compra do título selecionado
                        const bond = treasuryBonds.find(b => `${b.tipo} ${b.vencimento}` === val)
                        if (bond?.puCompra) {
                          setForm(f => ({ ...f, ticker: val, unitPrice: bond.puCompra!.toFixed(2) }))
                          userEditedPriceRef.current = false
                        }
                      }}
                      disabled={!!editingId}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Selecione um título</option>
                      {treasuryBonds
                        .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.vencimento.localeCompare(b.vencimento))
                        .map(b => {
                          const value = `${b.tipo} ${b.vencimento}`
                          const year = b.vencimento.split('/').pop() ?? b.vencimento
                          const label = `${b.tipo} ${year}`
                          return <option key={value} value={value}>{label}</option>
                        })
                      }
                    </select>
                  ) : (
                    <TickerInput
                      required
                      value={form.ticker}
                      onChange={v => { field('ticker', v); setPriceMsg(''); lastFetchedRef.current = '' }}
                      onSelect={r => {
                        const cls = isFIIResult(r) ? 'FII' : r.type === 'cryptocurrency' ? 'CRYPTO' : 'STOCK'
                        setForm(f => ({ ...f, ticker: r.ticker, assetClass: cls }))
                      }}
                      assetClass={form.assetClass}
                      disabled={!!editingId}
                    />
                  )}
                </div>
                {form.assetClass === 'FII' && (
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Segmento</label>
                    <select
                      value={form.subtype}
                      onChange={e => field('subtype', e.target.value)}
                      disabled={!!editingId}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Selecione</option>
                      {FII_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={e => field('date', e.target.value)}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Quantidade</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.quantity}
                    onChange={e => field('quantity', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Preço Unit. (R$)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={e => { userEditedPriceRef.current = true; field('unitPrice', e.target.value) }}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                  {priceMsg && (
                    <p className={`text-xs mt-1 ${priceMsg.startsWith('Cotação atual') ? 'text-green-400' : 'text-text-muted'}`}>
                      {priceMsg}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Taxas (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.fees}
                    onChange={e => field('fees', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {(Number(form.quantity) > 0 && Number(form.unitPrice) > 0) && (
                <div className="bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-text-secondary">Total do lançamento</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {form.quantity} × {formatCurrency(Number(form.unitPrice))}
                      {Number(form.fees) > 0 && ` + ${formatCurrency(Number(form.fees))} taxas`}
                    </p>
                  </div>
                  <p className={`text-xl font-bold ${form.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(Number(form.quantity) * Number(form.unitPrice) + Number(form.fees))}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs text-text-secondary mb-1">Observações</label>
                <input
                  value={form.notes}
                  onChange={e => field('notes', e.target.value)}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  placeholder="Opcional"
                />
              </div>
            </>
          )}

          {form.assetClass === 'FIXED_INCOME' && !editingId && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Emissor</label>
                  <input
                    required
                    value={form.issuer}
                    onChange={e => field('issuer', e.target.value)}
                    placeholder="Ex: Banco XP"
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Tipo de título</label>
                  <select
                    required
                    value={form.subtype}
                    onChange={e => field('subtype', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Selecione</option>
                    {FIXED_INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Indexador</label>
                  <select
                    value={form.indexer}
                    onChange={e => field('indexer', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  >
                    {FIXED_INCOME_INDEXERS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    {form.indexer === 'Prefixado' ? 'Taxa prefixada' : `Taxa do ${form.indexer}`}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.rate}
                      onChange={e => field('rate', e.target.value)}
                      placeholder="0,00"
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 pr-8 text-text-primary text-sm focus:outline-none focus:border-accent"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Forma <span className="text-text-muted">(Opcional)</span>
                  </label>
                  <select
                    value={form.fixedForm}
                    onChange={e => field('fixedForm', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  >
                    {FIXED_INCOME_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Valor em R$</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={e => field('unitPrice', e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Data da compra</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={e => field('date', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-text-secondary">Data de vencimento</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-text-secondary font-semibold">Liquidez diária</span>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, dailyLiquidity: !f.dailyLiquidity }))}
                        className={`relative w-9 h-5 rounded-full transition-colors ${form.dailyLiquidity ? 'bg-accent' : 'bg-bg-primary border border-border'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.dailyLiquidity ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                  </div>
                  <input
                    type="date"
                    required
                    value={form.maturityDate}
                    onChange={e => field('maturityDate', e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {Number(form.unitPrice) > 0 && (
                <div className="bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between">
                  <p className="text-sm text-text-secondary font-semibold">Valor total</p>
                  <p className={`text-xl font-bold ${form.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(Number(form.unitPrice))}
                  </p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 bg-bg-primary border border-border text-text-secondary hover:text-text-primary py-2 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-accent hover:bg-blue-600 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remover lançamento"
        description="Esta ação não pode ser desfeita. O lançamento será removido permanentemente."
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </AppLayout>
  )
}
