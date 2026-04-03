'use client'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { AssetClassBadge } from '@/components/ui/Badge'
import { dividendsApi } from '@/lib/api'
import { formatCurrency, formatDate, ASSET_CLASS_LABELS, DIVIDEND_TYPE_LABELS } from '@/lib/formatters'
import { Plus, RefreshCw, Trash2, TrendingUp } from 'lucide-react'

const ASSET_CLASSES = ['FII', 'STOCK', 'FIXED_INCOME', 'TREASURY', 'CRYPTO'] as const
const DIVIDEND_TYPES = ['DIVIDEND', 'JCP', 'INCOME', 'AMORTIZATION', 'SUBSCRIPTION'] as const

const EMPTY_FORM = {
  ticker: '',
  assetClass: 'STOCK' as string,
  type: 'DIVIDEND' as string,
  exDate: new Date().toISOString().slice(0, 10),
  payDate: new Date().toISOString().slice(0, 10),
  valuePerUnit: '',
  quantity: '',
  notes: '',
}

export default function DividendsPage() {
  const [dividends, setDividends] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [error, setError] = useState('')

  const walletId = typeof window !== 'undefined' ? localStorage.getItem('walletId') ?? '' : ''

  const load = async () => {
    if (!walletId) return
    setLoading(true)
    try {
      const data = await dividendsApi.list(walletId)
      setDividends(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [walletId])

  const totalYear = dividends
    .filter(d => new Date(d.payDate).getFullYear() === new Date().getFullYear())
    .reduce((s, d) => s + Number(d.totalValue), 0)

  const total12M = (() => {
    const ago = new Date()
    ago.setMonth(ago.getMonth() - 12)
    return dividends
      .filter(d => new Date(d.payDate) >= ago)
      .reduce((s, d) => s + Number(d.totalValue), 0)
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await dividendsApi.create(walletId, {
        ...form,
        valuePerUnit: Number(form.valuePerUnit),
        quantity: Number(form.quantity),
      })
      setOpen(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao salvar provento')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este provento?')) return
    await dividendsApi.remove(id)
    await load()
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await dividendsApi.sync(walletId)
      setSyncMsg(
        result.inserted > 0
          ? `${result.inserted} provento(s) importado(s) de: ${result.tickers.join(', ')}`
          : 'Nenhum provento novo encontrado.'
      )
      if (result.inserted > 0) await load()
    } catch {
      setSyncMsg('Erro ao sincronizar. Verifique o BRAPI_TOKEN ou tente novamente.')
    } finally {
      setSyncing(false)
    }
  }

  const field = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Proventos</h1>
          <p className="text-text-secondary text-sm mt-0.5">Dividendos, JCP e rendimentos recebidos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-bg-secondary hover:bg-bg-hover border border-border text-text-secondary hover:text-text-primary text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Adicionar Provento
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${syncMsg.startsWith('Erro') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {syncMsg}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-green-400" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Recebido em {new Date().getFullYear()}</p>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(totalYear)}</p>
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
              <p className="text-xl font-bold text-text-primary">{formatCurrency(total12M)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm animate-pulse">
            Carregando...
          </div>
        ) : dividends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm gap-2">
            <p>Nenhum provento registrado.</p>
            <button onClick={() => setOpen(true)} className="text-accent hover:underline">
              Adicionar primeiro provento
            </button>
          </div>
        ) : (
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
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {dividends.map((d: any) => (
                <tr key={d.id} className="border-t border-border hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">{d.asset?.ticker}</span>
                      <AssetClassBadge cls={d.asset?.assetClass} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-medium">
                      {DIVIDEND_TYPE_LABELS[d.type as keyof typeof DIVIDEND_TYPE_LABELS] ?? d.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatDate(d.exDate)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatDate(d.payDate)}</td>
                  <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(Number(d.valuePerUnit))}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{Number(d.quantity)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-400">{formatCurrency(Number(d.totalValue))}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-text-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Adicionar Provento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Ticker</label>
              <input
                required
                value={form.ticker}
                onChange={e => field('ticker', e.target.value.toUpperCase())}
                placeholder="Ex: HGLG11"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Classe</label>
              <select
                value={form.assetClass}
                onChange={e => field('assetClass', e.target.value)}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              >
                {ASSET_CLASSES.map(c => (
                  <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Tipo de Provento</label>
            <select
              value={form.type}
              onChange={e => field('type', e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
            >
              {DIVIDEND_TYPES.map(t => (
                <option key={t} value={t}>{DIVIDEND_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Data COM</label>
              <input
                type="date"
                required
                value={form.exDate}
                onChange={e => field('exDate', e.target.value)}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Data Pagamento</label>
              <input
                type="date"
                required
                value={form.payDate}
                onChange={e => field('payDate', e.target.value)}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Valor por Cota (R$)</label>
              <input
                type="number"
                required
                min="0.000001"
                step="any"
                value={form.valuePerUnit}
                onChange={e => field('valuePerUnit', e.target.value)}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Quantidade (na data COM)</label>
              <input
                type="number"
                required
                min="1"
                step="1"
                value={form.quantity}
                onChange={e => field('quantity', e.target.value)}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {form.valuePerUnit && form.quantity && (
            <div className="bg-bg-primary rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-text-secondary text-sm">Total calculado</span>
              <span className="text-green-400 font-semibold">
                {formatCurrency(Number(form.valuePerUnit) * Number(form.quantity))}
              </span>
            </div>
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
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  )
}
