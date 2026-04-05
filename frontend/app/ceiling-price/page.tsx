'use client'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { ceilingPriceApi } from '@/lib/api'
import { formatCurrency, ASSET_CLASS_LABELS } from '@/lib/formatters'
import { Settings, LayoutGrid, List, RefreshCw } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type FormulaResult = { value: number | null; upside: number | null; valid: boolean; na: boolean }
type Signal = 'BARATO' | 'NEUTRO' | 'CARO' | 'SEM_DADOS'

interface Asset {
  ticker: string
  assetClass: string
  currentPrice: number
  dpa: number | null
  lpa: number | null
  vpa: number | null
  formulas: { bazin: FormulaResult; graham: FormulaResult; lynch: FormulaResult; gordon: FormulaResult }
  average: number | null
  signal: Signal
}

interface Params { bazinYield: number; ke: number; g: number; lynchGrowth: number; cdiAnnual: number }

// ─── Helpers visuais ──────────────────────────────────────────────────────────
const SIGNAL_STYLE: Record<Signal, { label: string; cls: string; dot: string }> = {
  BARATO:    { label: 'BARATO',    cls: 'bg-green-500/15 text-green-400 border-green-500/30',  dot: 'bg-green-400' },
  NEUTRO:    { label: 'NEUTRO',    cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  CARO:      { label: 'CARO',      cls: 'bg-red-500/15 text-red-400 border-red-500/30',         dot: 'bg-red-400' },
  SEM_DADOS: { label: 'SEM DADOS', cls: 'bg-bg-hover text-text-muted border-border',             dot: 'bg-text-muted' },
}

function UpsideTag({ upside }: { upside: number | null }) {
  if (upside === null) return <span className="text-text-muted text-xs">—</span>
  const pos = upside >= 0
  return (
    <span className={`text-xs font-medium ${pos ? 'text-green-400' : 'text-red-400'}`}>
      {pos ? '▲' : '▼'} {Math.abs(upside).toFixed(1)}%
    </span>
  )
}

function FormulaCell({ result, label }: { result: FormulaResult; label: string }) {
  if (result.na) return (
    <div className="text-center">
      <div className="text-xs text-text-muted">N/A</div>
      <div className="text-xs text-text-muted/60">{label}</div>
    </div>
  )
  if (!result.valid || result.value === null) return (
    <div className="text-center">
      <div className="text-xs text-text-muted">N/D</div>
      <div className="text-xs text-text-muted/60">{label}</div>
    </div>
  )
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-text-primary">{formatCurrency(result.value)}</div>
      <UpsideTag upside={result.upside} />
    </div>
  )
}

// ─── Card por ativo ───────────────────────────────────────────────────────────
function AssetCard({ asset }: { asset: Asset }) {
  const sig = SIGNAL_STYLE[asset.signal]
  const formulas: { key: keyof Asset['formulas']; label: string }[] = [
    { key: 'bazin',  label: 'Bazin' },
    { key: 'graham', label: 'Graham' },
    { key: 'lynch',  label: 'P/L Justo' },
    { key: 'gordon', label: 'Gordon' },
  ]

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-bold text-text-primary text-base">{asset.ticker}</span>
          <span className="ml-2 text-xs text-text-muted">{ASSET_CLASS_LABELS[asset.assetClass] ?? asset.assetClass}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${sig.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sig.dot}`} />
          {sig.label}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-border pb-3">
        <span className="text-text-secondary">Preço atual</span>
        <span className="font-bold text-text-primary">{formatCurrency(asset.currentPrice)}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {formulas.map(({ key, label }) => {
          const f = asset.formulas[key]
          if (f.na) return (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{label}</span>
              <span className="text-xs text-text-muted">N/A</span>
            </div>
          )
          if (!f.valid || f.value === null) return (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{label}</span>
              <span className="text-xs text-text-muted">N/D</span>
            </div>
          )
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-secondary">{label}</span>
              <div className="text-right">
                <div className="text-xs font-semibold text-text-primary">{formatCurrency(f.value)}</div>
                <UpsideTag upside={f.upside} />
              </div>
            </div>
          )
        })}
      </div>

      {asset.average !== null && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-text-muted">Média dos modelos</span>
          <span className="text-sm font-bold text-accent">{formatCurrency(asset.average)}</span>
        </div>
      )}

      {(asset.dpa !== null || asset.lpa !== null || asset.vpa !== null) && (
        <div className="flex gap-3 text-xs text-text-muted pt-1 border-t border-border">
          {asset.dpa !== null && <span>DPA: <b className="text-text-secondary">{formatCurrency(asset.dpa)}</b></span>}
          {asset.lpa !== null && <span>LPA: <b className="text-text-secondary">{formatCurrency(asset.lpa)}</b></span>}
          {asset.vpa !== null && <span>VPA: <b className="text-text-secondary">{formatCurrency(asset.vpa)}</b></span>}
        </div>
      )}
    </Card>
  )
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────
function AssetRow({ asset }: { asset: Asset }) {
  const sig = SIGNAL_STYLE[asset.signal]
  return (
    <tr className="border-b border-border hover:bg-bg-hover transition-colors">
      <td className="px-4 py-3">
        <div className="font-semibold text-text-primary text-sm">{asset.ticker}</div>
        <div className="text-xs text-text-muted">{ASSET_CLASS_LABELS[asset.assetClass] ?? asset.assetClass}</div>
      </td>
      <td className="px-4 py-3 text-right font-semibold text-text-primary text-sm">
        {formatCurrency(asset.currentPrice)}
      </td>
      {(['bazin', 'graham', 'lynch', 'gordon'] as const).map(key => {
        const f = asset.formulas[key]
        return (
          <td key={key} className="px-4 py-3 text-center">
            {f.na ? (
              <span className="text-xs text-text-muted/50">N/A</span>
            ) : !f.valid || f.value === null ? (
              <span className="text-xs text-text-muted">N/D</span>
            ) : (
              <div>
                <div className="text-sm font-semibold text-text-primary">{formatCurrency(f.value)}</div>
                <UpsideTag upside={f.upside} />
              </div>
            )}
          </td>
        )
      })}
      <td className="px-4 py-3 text-center">
        {asset.average !== null
          ? <span className="text-sm font-bold text-accent">{formatCurrency(asset.average)}</span>
          : <span className="text-xs text-text-muted">—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${sig.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sig.dot}`} />
          {sig.label}
        </span>
      </td>
    </tr>
  )
}

// ─── Modal de parâmetros ──────────────────────────────────────────────────────
function ParamsModal({
  open, onClose, params,
  onApply,
}: {
  open: boolean
  onClose: () => void
  params: Params
  onApply: (p: Partial<Params>) => void
}) {
  const [bazinYield, setBazinYield] = useState(String(params.bazinYield))
  const [keSpread, setKeSpread]     = useState(String(Math.round((params.ke - params.cdiAnnual) * 100) / 100))
  const [g, setG]                   = useState(String(params.g))
  const [lynchGrowth, setLynchGrowth] = useState(String(params.lynchGrowth))

  useEffect(() => {
    setBazinYield(String(params.bazinYield))
    setKeSpread(String(Math.round((params.ke - params.cdiAnnual) * 100) / 100))
    setG(String(params.g))
    setLynchGrowth(String(params.lynchGrowth))
  }, [params])

  const keTotal = Math.round((params.cdiAnnual + Number(keSpread)) * 100) / 100

  const handleApply = () => {
    onApply({
      bazinYield: Number(bazinYield),
      ke: keTotal,
      g: Number(g),
      lynchGrowth: Number(lynchGrowth),
    })
    onClose()
  }

  const handleReset = () => {
    setBazinYield('6')
    setKeSpread('3')
    setG('3')
    setLynchGrowth('7')
  }

  const inputCls = 'w-20 bg-bg-primary border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none focus:border-accent'

  return (
    <Modal open={open} onClose={onClose} title="Parâmetros dos Modelos">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Yield mínimo (Bazin)</p>
            <p className="text-xs text-text-muted mt-0.5">Retorno mínimo exigido em dividendos</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="number" min="1" max="20" step="0.5" value={bazinYield}
              onChange={e => setBazinYield(e.target.value)} className={inputCls} />
            <span className="text-text-secondary text-sm">%</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Retorno exigido — ke (Gordon)</p>
            <p className="text-xs text-text-muted mt-0.5">
              CDI atual: {params.cdiAnnual.toFixed(2)}% + spread =&nbsp;
              <span className="text-accent font-semibold">{keTotal.toFixed(2)}%</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">CDI +</span>
            <input type="number" min="0" max="20" step="0.5" value={keSpread}
              onChange={e => setKeSpread(e.target.value)} className={inputCls} />
            <span className="text-text-secondary text-sm">%</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Crescimento perpétuo — g (Gordon)</p>
            <p className="text-xs text-text-muted mt-0.5">Taxa de crescimento dos dividendos no longo prazo</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="15" step="0.5" value={g}
              onChange={e => setG(e.target.value)} className={inputCls} />
            <span className="text-text-secondary text-sm">%</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Crescimento esperado (P/L Justo)</p>
            <p className="text-xs text-text-muted mt-0.5">Taxa de crescimento anual do lucro por ação</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="30" step="0.5" value={lynchGrowth}
              onChange={e => setLynchGrowth(e.target.value)} className={inputCls} />
            <span className="text-text-secondary text-sm">%</span>
          </div>
        </div>

        <div className="flex justify-between pt-2 border-t border-border gap-3">
          <button onClick={handleReset}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border rounded-lg transition-colors">
            Restaurar padrões
          </button>
          <button onClick={handleApply}
            className="px-5 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
            Aplicar
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function CeilingPricePage() {
  const [assets, setAssets]       = useState<Asset[]>([])
  const [params, setParams]       = useState<Params | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [view, setView]           = useState<'table' | 'cards'>('table')
  const [filterClass, setFilter]  = useState('')
  const [showParams, setShowParams] = useState(false)

  // Parâmetros customizados pelo usuário (null = usa defaults do backend)
  const [customParams, setCustomParams] = useState<Partial<Params>>({})

  const walletId = typeof window !== 'undefined' ? localStorage.getItem('walletId') ?? '' : ''

  const load = async (overrides?: Partial<Params>) => {
    if (!walletId) return
    setLoading(true)
    setError('')
    try {
      const p = overrides ?? customParams
      const data = await ceilingPriceApi.get(walletId, {
        assetClass: filterClass || undefined,
        ke: p.ke,
        g: p.g,
        bazinYield: p.bazinYield,
        lynchGrowth: p.lynchGrowth,
      })
      setAssets(data.assets)
      setParams(data.params)
    } catch {
      setError('Erro ao carregar dados. Verifique se o backend está rodando.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [walletId, filterClass])

  const handleApplyParams = (p: Partial<Params>) => {
    setCustomParams(p)
    load(p)
  }

  const CLASSES = ['', 'STOCK', 'FII', 'FIXED_INCOME', 'TREASURY', 'CRYPTO']
  const CLASS_LABELS: Record<string, string> = { '': 'Todos', ...ASSET_CLASS_LABELS }

  // Resumo dos sinais
  const counts = { BARATO: 0, NEUTRO: 0, CARO: 0, SEM_DADOS: 0 }
  assets.forEach(a => { counts[a.signal]++ })

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Preço Teto</h1>
          <p className="text-text-secondary text-sm mt-0.5">Análise de preço máximo justo para compra</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary bg-bg-secondary border border-border px-3 py-2 rounded-lg transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button onClick={() => setShowParams(true)}
            className="flex items-center gap-2 text-sm font-medium text-text-primary bg-bg-secondary border border-border px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors">
            <Settings size={15} />
            Parâmetros
          </button>
        </div>
      </div>

      {/* Parâmetros ativos */}
      {params && (
        <div className="flex flex-wrap gap-3 mb-5 text-xs text-text-muted">
          <span className="bg-bg-secondary border border-border px-2.5 py-1 rounded-full">
            Bazin: yield mín. <b className="text-text-secondary">{params.bazinYield}%</b>
          </span>
          <span className="bg-bg-secondary border border-border px-2.5 py-1 rounded-full">
            Gordon: ke <b className="text-text-secondary">{params.ke.toFixed(2)}%</b> / g <b className="text-text-secondary">{params.g}%</b>
          </span>
          <span className="bg-bg-secondary border border-border px-2.5 py-1 rounded-full">
            P/L Justo: crescimento <b className="text-text-secondary">{params.lynchGrowth}%</b>
          </span>
          <span className="bg-bg-secondary border border-border px-2.5 py-1 rounded-full">
            CDI atual: <b className="text-text-secondary">{params.cdiAnnual.toFixed(2)}%</b>
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">{error}</div>
      )}

      {/* Filtros e toggle de vista */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex gap-1.5">
          {CLASSES.map(cls => (
            <button key={cls} onClick={() => setFilter(cls)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterClass === cls
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary border border-border text-text-muted hover:text-text-primary'
              }`}>
              {CLASS_LABELS[cls] ?? cls}
            </button>
          ))}
        </div>

        {/* Sinais resumidos */}
        {!loading && assets.length > 0 && (
          <div className="flex gap-2 text-xs">
            {counts.BARATO  > 0 && <span className="bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-medium">🟢 {counts.BARATO} Barato</span>}
            {counts.NEUTRO  > 0 && <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-medium">🟡 {counts.NEUTRO} Neutro</span>}
            {counts.CARO    > 0 && <span className="bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">🔴 {counts.CARO} Caro</span>}
          </div>
        )}

        <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1">
          <button onClick={() => setView('table')}
            className={`p-1.5 rounded transition-colors ${view === 'table' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}>
            <List size={15} />
          </button>
          <button onClick={() => setView('cards')}
            className={`p-1.5 rounded transition-colors ${view === 'cards' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}>
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-text-secondary text-sm animate-pulse">Carregando análise...</div>
        </div>
      ) : assets.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-text-muted text-sm">
          Nenhum ativo encontrado na carteira.
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map(a => <AssetCard key={a.ticker} asset={a} />)}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-primary">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Ativo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">P. Atual</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">
                    <div>Bazin</div>
                    <div className="text-text-muted/50 font-normal normal-case">DPA / {params?.bazinYield ?? 6}%</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">
                    <div>Graham</div>
                    <div className="text-text-muted/50 font-normal normal-case">√(22.5×LPA×VPA)</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">
                    <div>P/L Justo</div>
                    <div className="text-text-muted/50 font-normal normal-case">LPA × {params?.lynchGrowth ?? 7}%</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">
                    <div>Gordon</div>
                    <div className="text-text-muted/50 font-normal normal-case">ke {params?.ke?.toFixed(1) ?? '—'}% / g {params?.g ?? 3}%</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">Média</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">Sinal</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => <AssetRow key={a.ticker} asset={a} />)}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="px-4 py-3 border-t border-border flex flex-wrap gap-4 text-xs text-text-muted">
            <span><b className="text-text-secondary">▲ / ▼ %</b> = margem até o preço teto</span>
            <span><b className="text-text-secondary">N/D</b> = sem dados disponíveis</span>
            <span><b className="text-text-secondary">N/A</b> = não aplicável ao tipo de ativo</span>
            <span><b className="text-text-secondary">DPA</b> = dividendos pagos nos últimos 12 meses por ação</span>
          </div>
        </Card>
      )}

      {params && (
        <ParamsModal
          open={showParams}
          onClose={() => setShowParams(false)}
          params={params}
          onApply={handleApplyParams}
        />
      )}
    </AppLayout>
  )
}
