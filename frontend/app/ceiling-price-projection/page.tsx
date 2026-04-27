'use client'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { investidor10Url } from '@/lib/external'
import { Card } from '@/components/ui/Card'
import { TickerInput } from '@/components/ui/TickerInput'
import { AssetLogo } from '@/components/ui/AssetLogo'
import { ceilingPriceProjectionApi, type CeilingPriceProjectionRow } from '@/lib/api'
import { getWalletId } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import {
  Crosshair, Plus, Pencil, Trash2, X, Check, Loader2,
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Info, Search,
} from 'lucide-react'

const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BARATO:    { label: 'Barato',    color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30' },
  NEUTRO:    { label: 'Neutro',    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  CARO:      { label: 'Caro',      color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  SEM_DADOS: { label: 'S/ dados',  color: 'text-text-muted', bg: 'bg-bg-primary',    border: 'border-border' },
}

function SignalBadge({ signal }: { signal: string }) {
  const cfg = SIGNAL_CONFIG[signal] ?? SIGNAL_CONFIG.SEM_DADOS
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function fmt(v: number | null, decimals = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  return v.toFixed(decimals).replace('.', ',')
}

function fmtBig(v: number | null): string {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + ' T'
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + ' B'
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + ' M'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + ' k'
  return v.toFixed(0)
}

// Formata número inteiro com separador de milhar pt-BR
function fmtThousands(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Preview legível ("≈ 902,5 milhões")
function fmtLucroPreview(raw: string): string | null {
  const n = Number(raw.replace(/\./g, ''))
  if (!isFinite(n) || n <= 0) return null
  if (n >= 1e9) return `≈ ${(n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bilhões`
  if (n >= 1e6) return `≈ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} milhões`
  if (n >= 1e3) return `≈ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return `R$ ${n.toLocaleString('pt-BR')}`
}

export default function CeilingPriceProjectionPage() {
  const [items, setItems] = useState<CeilingPriceProjectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletId, setWalletId] = useState('')
  const [showFormulas, setShowFormulas] = useState(false)
  const [search, setSearch] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CeilingPriceProjectionRow | null>(null)
  const [formTicker, setFormTicker] = useState('')
  const [formDy, setFormDy] = useState('')
  const [formMargem, setFormMargem] = useState('')
  const [formPayout, setFormPayout] = useState('')
  const [formLucro, setFormLucro] = useState('')
  const [payoutHint, setPayoutHint] = useState<number | null>(null)
  const [lucroHint, setLucroHint] = useState<number | null>(null)
  const [loadingHint, setLoadingHint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const wid = getWalletId()
    setWalletId(wid)
    if (wid) load(wid)
    else setLoading(false)
  }, [])

  async function load(wid: string) {
    setLoading(true)
    try {
      const r = await ceilingPriceProjectionApi.list(wid)
      setItems(r.items)
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Erro ao carregar projeções')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    if (!walletId) return
    setRefreshing(true)
    try {
      const r = await ceilingPriceProjectionApi.list(walletId)
      setItems(r.items)
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Erro ao atualizar')
    } finally {
      setRefreshing(false)
    }
  }

  function openNewModal() {
    setEditing(null)
    setFormTicker('')
    setFormDy('7')
    setFormMargem('5')
    setFormPayout('')
    setFormLucro('')
    setPayoutHint(null)
    setLucroHint(null)
    setSaveError(null)
    setModalOpen(true)
  }

  function openEditModal(row: CeilingPriceProjectionRow) {
    setEditing(row)
    setFormTicker(row.ticker)
    setFormDy(String(row.dyEsperado))
    setFormMargem(String(row.margemCrescimento))
    setFormPayout(String(row.payout))
    setFormLucro(fmtThousands(String(Math.round(row.lucroAnterior))))
    setPayoutHint(row.payoutAtual)
    setLucroHint(row.lucroLiquidoApi)
    setSaveError(null)
    setModalOpen(true)
  }

  // Ao selecionar um ticker novo, busca dados atuais como sugestão
  async function handleTickerSelect(ticker: string) {
    setFormTicker(ticker)
    if (!ticker) return
    setLoadingHint(true)
    setPayoutHint(null)
    setLucroHint(null)
    try {
      const f = await ceilingPriceProjectionApi.fundamentals(ticker)
      setPayoutHint(f.payoutAtual)
      setLucroHint(f.lucroLiquidoAnterior)
      if (f.payoutAtual !== null && !formPayout) {
        setFormPayout(f.payoutAtual.toFixed(2))
      }
      if (f.lucroLiquidoAnterior !== null && !formLucro) {
        setFormLucro(fmtThousands(String(f.lucroLiquidoAnterior)))
      }
    } catch {
      // ignora — usuário digita manualmente
    } finally {
      setLoadingHint(false)
    }
  }

  async function handleSave() {
    const ticker = formTicker.toUpperCase().trim()
    const dy = Number(formDy.replace(',', '.'))
    const margem = Number(formMargem.replace(',', '.'))
    const payout = Number(formPayout.replace(',', '.'))
    const lucroAnterior = Number(formLucro.replace(/\./g, '').replace(',', '.'))

    if (!editing && !ticker) { setSaveError('Informe o ticker'); return }
    if (!isFinite(dy) || dy <= 0) { setSaveError('DY Esperado deve ser maior que zero'); return }
    if (!isFinite(margem)) { setSaveError('Margem inválida'); return }
    if (!isFinite(payout) || payout < 0) { setSaveError('Payout inválido'); return }
    if (!isFinite(lucroAnterior) || lucroAnterior < 0) { setSaveError('Lucro Anterior inválido'); return }

    setSaving(true)
    setSaveError(null)
    try {
      if (editing) {
        await ceilingPriceProjectionApi.update(walletId, editing.id, {
          dyEsperado: dy,
          margemCrescimento: margem,
          payout,
          lucroAnterior,
        })
      } else {
        await ceilingPriceProjectionApi.create(walletId, {
          ticker,
          dyEsperado: dy,
          margemCrescimento: margem,
          payout,
          lucroAnterior,
        })
      }
      setModalOpen(false)
      await load(walletId)
    } catch (e: any) {
      const code = e?.response?.data?.error
      if (code === 'duplicate_ticker') setSaveError('Já existe projeção para este ticker')
      else setSaveError(e?.response?.data?.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await ceilingPriceProjectionApi.remove(walletId, id)
      setItems(prev => prev.filter(x => x.id !== id))
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
  }

  const filtered = search
    ? items.filter(x => x.ticker.toUpperCase().includes(search.toUpperCase()))
    : items

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh] gap-3 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Carregando projeções...
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Crosshair size={22} /> Preço Teto Projetivo
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Cadastro de ações com cálculo do preço teto baseado em projeção de lucro
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-primary border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Atualizar cotações
          </button>
          <button
            onClick={openNewModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity font-medium"
          >
            <Plus size={14} /> Nova projeção
          </button>
        </div>
      </div>

      {/* Methodology */}
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
              <h3 className="text-sm font-bold text-text-primary mb-2">Fórmula Projetiva (Bazin com crescimento)</h3>
              <div className="font-mono text-accent space-y-1 mb-3">
                <p>Lucro Proj. = Lucro Líquido × (1 + Margem)</p>
                <p>LPA Proj.  = Lucro Proj. / Nº Papéis</p>
                <p>DPA Proj.  = LPA Proj. × Payout</p>
                <p>Preço Teto = DPA Proj. / DY Esperado</p>
              </div>
              <ul className="space-y-1 text-text-muted">
                <li>DY Esperado, Margem, Payout e Lucro Anterior são definidos por você</li>
                <li>Payout atual e lucro líquido são pré-preenchidos pela API ao cadastrar</li>
                <li>Demais dados em tempo real: brapi.dev (LPA, DPA, cotação, nº de papéis)</li>
              </ul>
            </div>
            <div className="bg-bg-primary rounded-lg p-4 border border-border">
              <h3 className="text-sm font-bold text-text-primary mb-2">Classificação</h3>
              <div className="space-y-2">
                <span className="flex items-center gap-2"><SignalBadge signal="BARATO" /> Cotação ≤ Preço Teto Projetivo</span>
                <span className="flex items-center gap-2"><SignalBadge signal="NEUTRO" /> Cotação até 10% acima do teto</span>
                <span className="flex items-center gap-2"><SignalBadge signal="CARO" /> Cotação mais de 10% acima do teto</span>
                <span className="flex items-center gap-2"><SignalBadge signal="SEM_DADOS" /> Dados fundamentais indisponíveis</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Search */}
      {items.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filtrar por ticker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-bg-primary border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
          />
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !error && (
        <Card className="py-16">
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <Crosshair size={36} className="opacity-50" />
            <p className="text-sm">Nenhuma ação cadastrada para projeção</p>
            <button
              onClick={openNewModal}
              className="mt-2 flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity font-medium"
            >
              <Plus size={14} /> Adicionar primeira ação
            </button>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card>
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle size={18} /> {error}
          </div>
        </Card>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-primary">
                  <th className="px-3 py-3 text-left text-text-muted font-semibold text-[11px] uppercase tracking-wider">Ticker</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">Cotação</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">DY 12M</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider bg-accent/5">DY Esperado</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">LPA</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">DPA</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider bg-accent/5">Payout</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">Nº Papéis</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider bg-accent/5">Lucro Anter.</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider bg-accent/5">Margem</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">Lucro Proj.</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">Preço Teto</th>
                  <th className="px-3 py-3 text-right text-text-muted font-semibold text-[11px] uppercase tracking-wider">Upside</th>
                  <th className="px-3 py-3 text-center text-text-muted font-semibold text-[11px] uppercase tracking-wider">Sinal</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const rowBg = r.signal === 'BARATO' ? 'bg-green-500/[0.03]'
                    : r.signal === 'CARO' ? 'bg-yellow-500/[0.02]'
                    : ''
                  return (
                    <tr key={r.id} className={`border-b border-border/50 hover:bg-bg-hover transition-colors ${rowBg}`}>
                      <td className="px-3 py-2.5 text-left">
                        <a href={investidor10Url(r.ticker)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-text-primary font-bold hover:text-accent transition-colors">
                          <AssetLogo ticker={r.ticker} size={22} />
                          {r.ticker}
                        </a>
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                        {r.cotacaoAtual !== null ? formatCurrency(r.cotacaoAtual) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-400 whitespace-nowrap">
                        {fmt(r.dy12m)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-accent font-bold whitespace-nowrap bg-accent/5">
                        {fmt(r.dyEsperado)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                        {r.lpa !== null ? formatCurrency(r.lpa) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                        {r.dpa !== null ? formatCurrency(r.dpa) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-accent font-bold whitespace-nowrap bg-accent/5" title={r.payoutAtual !== null ? `Atual: ${fmt(r.payoutAtual, 1)}%` : undefined}>
                        {fmt(r.payout, 1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                        {fmtBig(r.nPapeis)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-accent font-bold whitespace-nowrap bg-accent/5" title={r.lucroLiquidoApi !== null ? `API: ${fmtBig(r.lucroLiquidoApi)}` : undefined}>
                        {fmtBig(r.lucroAnterior)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap bg-accent/5 ${
                        r.margemCrescimento >= 0 ? 'text-accent' : 'text-red-400'
                      }`}>
                        {r.margemCrescimento >= 0 ? '+' : ''}{fmt(r.margemCrescimento)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                        {fmtBig(r.lucroProjetivo)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap text-text-primary">
                        {r.precoTetoProjetivo !== null ? formatCurrency(r.precoTetoProjetivo) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${
                        r.upside !== null ? (r.upside >= 0 ? 'text-green-400' : 'text-red-400') : 'text-text-muted'
                      }`}>
                        {r.upside !== null && (
                          <span className="inline-flex items-center gap-1">
                            {r.upside >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {r.upside >= 0 ? '+' : ''}{fmt(r.upside)}%
                          </span>
                        )}
                        {r.upside === null && '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <SignalBadge signal={r.signal} />
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(r)}
                            className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-accent transition-colors"
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deleting === r.id}
                            className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Excluir"
                          >
                            {deleting === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Footer */}
      {items.length > 0 && (
        <p className="text-[10px] text-text-muted mt-4 text-center">
          {items.length} ação(ões) cadastrada(s) &middot; Fonte: brapi.dev (atualizada a cada 1h) &middot; Cotação em tempo real
        </p>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-secondary border border-border rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-text-primary">
                {editing ? `Editar projeção — ${editing.ticker}` : 'Nova projeção'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {!editing && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Ticker</label>
                  <TickerInput
                    value={formTicker}
                    onChange={setFormTicker}
                    onSelect={r => handleTickerSelect(r.ticker)}
                    placeholder="Ex: PETR4"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  DY Esperado (%) <span className="text-text-muted">— retorno em dividendos almejado</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formDy}
                  onChange={e => setFormDy(e.target.value)}
                  placeholder="7,00"
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Margem de Crescimento (%) <span className="text-text-muted">— crescimento esperado do lucro</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formMargem}
                  onChange={e => setFormMargem(e.target.value)}
                  placeholder="5,00"
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Payout (%) <span className="text-text-muted">— % do lucro distribuído como dividendos</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formPayout}
                  onChange={e => setFormPayout(e.target.value)}
                  placeholder="60,00"
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
                />
                {(loadingHint || payoutHint !== null) && (
                  <p className="text-[10px] text-text-muted mt-1">
                    {loadingHint
                      ? 'Buscando payout atual...'
                      : payoutHint !== null
                        ? <>Payout atual (DPA/LPA 12M): <button type="button" onClick={() => setFormPayout(payoutHint!.toFixed(2))} className="text-accent hover:underline font-medium">{fmt(payoutHint, 2)}%</button></>
                        : null}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Lucro Líquido Anterior (R$) <span className="text-text-muted">— valor absoluto, último ano fiscal</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formLucro}
                  onChange={e => setFormLucro(fmtThousands(e.target.value))}
                  placeholder="6.700.000.000"
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
                />
                <div className="flex items-center justify-between mt-1 gap-2">
                  <span className="text-[10px] text-accent font-medium">{fmtLucroPreview(formLucro)}</span>
                  {loadingHint
                    ? <span className="text-[10px] text-text-muted">Buscando...</span>
                    : lucroHint !== null
                      ? <span className="text-[10px] text-text-muted">brapi: <button type="button" onClick={() => setFormLucro(fmtThousands(String(lucroHint)))} className="text-accent hover:underline font-medium">{fmtBig(lucroHint)}</button></span>
                      : null}
                </div>
              </div>

              {saveError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="px-4 py-2 text-xs rounded-lg text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg bg-accent text-white hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editing ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
