'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, X, Trash2 } from 'lucide-react'
import { formatCurrency, formatPercent, ASSET_CLASS_LABELS } from '@/lib/formatters'
import { VariationBadge, AssetClassBadge } from '@/components/ui/Badge'
import { AssetLogo } from '@/components/ui/AssetLogo'
import { transactionsApi } from '@/lib/api'

interface Asset {
  assetId: string
  ticker: string
  assetClass: string
  subtype: string | null
  quantity: number
  avgPrice: number
  currentPrice: number
  currentValue: number
  investedValue: number
  variation: number
  gain: number
  dy?: number | null
  yoc?: number | null
  realAssetId?: string | null
  txId?: string | null
  issuer?: string | null
  indexer?: string | null
  rate?: number | null
  fixedForm?: string | null
  dailyLiquidity?: boolean | null
  maturityDate?: string | null
  purchaseDate?: string | null
}

function buildFixedIncomeLabel(a: Asset): string {
  const parts: string[] = []
  if (a.issuer) parts.push(a.issuer)
  if (a.fixedForm) parts.push(a.fixedForm)
  if (a.rate != null && a.indexer) {
    parts.push(a.indexer === 'Prefixado' ? `${a.rate}% a.a.` : `${a.rate}% ${a.indexer}`)
  } else if (a.indexer) {
    parts.push(a.indexer)
  }
  return parts.join(' - ') || a.ticker
}

function issuerLogoSlug(issuer: string | null | undefined): string {
  if (!issuer) return ''
  return issuer.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const ASSET_CLASS_UNIT_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'Cotas',
  CRYPTO: 'Unidades',
  TREASURY: 'Títulos',
  FIXED_INCOME: 'Títulos',
}

interface DeleteAssetModalProps {
  asset: Asset
  onClose: () => void
  onConfirm: () => void
}

function DeleteAssetModal({ asset, onClose, onConfirm }: DeleteAssetModalProps) {
  const [option, setOption] = useState<'sell' | 'delete'>('sell')
  const [loading, setLoading] = useState(false)
  const walletId = typeof window !== 'undefined' ? localStorage.getItem('walletId') ?? '' : ''
  const unitLabel = ASSET_CLASS_UNIT_LABELS[asset.assetClass] ?? 'Unidades'

  const isFixedIncome = asset.assetClass === 'FIXED_INCOME'

  const handleConfirm = async () => {
    setLoading(true)
    try {
      if (option === 'sell') {
        await transactionsApi.create(walletId, {
          ticker: asset.ticker,
          assetClass: asset.assetClass,
          subtype: asset.subtype || undefined,
          type: 'SELL',
          date: new Date().toISOString().split('T')[0],
          quantity: asset.quantity,
          unitPrice: asset.currentPrice,
          fees: 0,
          issuer: asset.issuer || undefined,
          indexer: asset.indexer || undefined,
          rate: asset.rate ?? undefined,
          fixedForm: asset.fixedForm || undefined,
          dailyLiquidity: asset.dailyLiquidity ?? undefined,
          maturityDate: asset.maturityDate || undefined,
        })
      } else {
        // "Excluir tudo": usa o assetId real para Renda Fixa
        const targetId = isFixedIncome && asset.realAssetId ? asset.realAssetId : asset.assetId
        await transactionsApi.removeAllByAsset(targetId)
      }
      onConfirm()
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-bg-secondary border border-border rounded-xl w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-text-primary font-semibold text-base">Excluir ativo</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Info banner */}
          <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3 text-sm text-text-secondary">
            A melhor forma de excluir um ativo é adicionando um lançamento,{' '}
            <Link href="/transactions" className="text-accent underline hover:text-accent/80">
              clique aqui para fazê-lo.
            </Link>
          </div>

          <p className="text-text-secondary text-sm">
            Mas se preferir, temos as opções de Exclusões Rápidas:
          </p>

          {/* Option 1 — Sell / Resgate */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              option === 'sell'
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-border/80'
            }`}
          >
            <input
              type="radio"
              name="delete-option"
              checked={option === 'sell'}
              onChange={() => setOption('sell')}
              className="mt-1 accent-accent"
            />
            <div>
              <span className="text-text-primary font-semibold text-sm">Adicionar Lançamento de Venda</span>
              <p className="text-text-muted text-xs mt-1 leading-relaxed">
                Ao confirmar essa opção, será realizado um lançamento de <strong className="text-text-primary">VENDA</strong> na quantidade de{' '}
                <strong className="text-text-primary">{asset.quantity} {unitLabel}</strong> do ativo{' '}
                <strong className="text-text-primary">{asset.ticker}</strong> pelo valor{' '}
                <strong className="text-text-primary">{formatCurrency(asset.currentPrice)}</strong>{' '}
                (última cotação) para o dia de hoje.
              </p>
            </div>
          </label>

          {/* Option 2 — Delete all */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              option === 'delete'
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-border/80'
            }`}
          >
            <input
              type="radio"
              name="delete-option"
              checked={option === 'delete'}
              onChange={() => setOption('delete')}
              className="mt-1 accent-accent"
            />
            <div>
              <span className="text-text-primary font-semibold text-sm">Excluir Lançamento</span>
              <p className="text-text-muted text-xs mt-1 leading-relaxed">
                Ao confirmar essa opção, todos os lançamentos de <strong className="text-text-primary">COMPRA</strong> e{' '}
                <strong className="text-text-primary">VENDA</strong> no ativo{' '}
                <strong className="text-text-primary">{asset.ticker}</strong> serão excluídos. Ao escolher essa opção,
                isso pode modificar o histórico de patrimônio, proventos e rentabilidade de sua carteira.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-text-primary text-bg-primary text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Processando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AssetTableProps {
  groupedAssets: Record<string, Asset[]>
  totalPatrimonio: number
  onRefresh?: () => void
}

function AssetRow({ asset, totalPatrimonio, onSell }: { asset: Asset; totalPatrimonio: number; onSell: (a: Asset) => void }) {
  const pctCarteira = totalPatrimonio > 0 ? (asset.currentValue / totalPatrimonio) * 100 : 0
  const isFixedIncome = asset.assetClass === 'FIXED_INCOME'

  return (
    <tr className="border-t border-border hover:bg-bg-hover transition-colors group">
      <td className="px-4 py-3">
        {isFixedIncome ? (
          <div className="flex items-center gap-2">
            <AssetLogo ticker={issuerLogoSlug(asset.issuer) || asset.ticker} size={26} />
            <span className="font-semibold text-text-primary text-sm">{buildFixedIncomeLabel(asset)}</span>
            {asset.subtype && (
              <span className="text-xs text-text-muted bg-bg-primary px-1.5 py-0.5 rounded">
                {asset.subtype}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href={`/stock-analysis?ticker=${asset.ticker}`} className="flex items-center gap-2 group/link">
              <AssetLogo ticker={asset.ticker} size={26} />
              <span className="font-semibold text-text-primary text-sm group-hover/link:text-accent transition-colors">{asset.ticker}</span>
            </Link>
            {asset.subtype && (
              <span className="text-xs text-text-muted bg-bg-primary px-1.5 py-0.5 rounded">
                {asset.subtype}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center text-text-secondary text-sm">
        {isFixedIncome && asset.maturityDate
          ? new Date(asset.maturityDate).toLocaleDateString('pt-BR')
          : '–'}
      </td>
      <td className="px-4 py-3 text-right text-text-secondary text-sm">{asset.quantity}</td>
      <td className="px-4 py-3 text-right text-text-secondary text-sm">{formatCurrency(asset.avgPrice)}</td>
      <td className="px-4 py-3 text-right text-text-primary text-sm font-medium">{formatCurrency(asset.currentPrice)}</td>
      <td className="px-4 py-3 text-right">
        <VariationBadge value={asset.variation} />
      </td>
      <td className="px-4 py-3 text-right">
        <span className={asset.gain >= 0 ? 'text-green-400 text-sm font-medium' : 'text-red-400 text-sm font-medium'}>
          {formatCurrency(asset.gain)}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-text-secondary text-sm">
        {asset.dy != null ? `${asset.dy.toFixed(2)}%` : '–'}
      </td>
      <td className="px-4 py-3 text-right text-text-secondary text-sm">
        {asset.yoc != null ? `${asset.yoc.toFixed(2)}%` : '–'}
      </td>
      <td className="px-4 py-3 text-right text-text-primary text-sm font-semibold">{formatCurrency(asset.currentValue)}</td>
      <td className="px-4 py-3 text-right text-text-secondary text-sm">{pctCarteira.toFixed(2)}%</td>
      <td className="px-2 py-3 text-center">
        <button
          onClick={() => onSell(asset)}
          title="Vender / Excluir ativo"
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
  )
}

function AssetGroup({ cls, assets, totalPatrimonio, defaultOpen, onSell }: { cls: string; assets: Asset[]; totalPatrimonio: number; defaultOpen: boolean; onSell: (a: Asset) => void }) {
  const [open, setOpen] = useState(defaultOpen)
  const groupValue = assets.reduce((s, a) => s + a.currentValue, 0)
  const groupGain = assets.reduce((s, a) => s + a.gain, 0)
  const groupPct = totalPatrimonio > 0 ? (groupValue / totalPatrimonio) * 100 : 0

  return (
    <>
      <tr
        className="bg-bg-primary/50 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 font-semibold text-text-primary" colSpan={3}>
          <div className="flex items-center gap-2">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <AssetClassBadge cls={cls} />
            <span className="text-sm">{ASSET_CLASS_LABELS[cls] ?? cls}</span>
            <span className="text-text-muted text-xs">({assets.length})</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-text-secondary text-sm" colSpan={5}>
          Ganho: <span className={groupGain >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(groupGain)}</span>
        </td>
        <td className="px-4 py-3 text-right text-text-secondary text-sm">Total: <span className="text-text-primary font-semibold">{formatCurrency(groupValue)}</span></td>
        <td className="px-4 py-3 text-right text-text-secondary text-sm" colSpan={2}>{groupPct.toFixed(2)}%</td>
      </tr>
      {open && assets.map(a => <AssetRow key={a.assetId} asset={a} totalPatrimonio={totalPatrimonio} onSell={onSell} />)}
    </>
  )
}

export function AssetTable({ groupedAssets, totalPatrimonio, onRefresh }: AssetTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const clsOrder = ['STOCK', 'FII', 'FIXED_INCOME', 'TREASURY', 'CRYPTO']
  const sorted = Object.entries(groupedAssets).sort(
    ([a], [b]) => clsOrder.indexOf(a) - clsOrder.indexOf(b)
  )

  const handleConfirm = () => {
    setDeleteTarget(null)
    onRefresh?.()
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Ativo</th>
              <th className="px-4 py-3 text-center">Vencimento</th>
              <th className="px-4 py-3 text-right">Qtd</th>
              <th className="px-4 py-3 text-right">Preço Médio</th>
              <th className="px-4 py-3 text-right">Preço Atual</th>
              <th className="px-4 py-3 text-right">Variação</th>
              <th className="px-4 py-3 text-right">Ganho</th>
              <th className="px-4 py-3 text-right">DY</th>
              <th className="px-4 py-3 text-right">YoC</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-right">% Carteira</th>
              <th className="px-2 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([cls, assets], i) => (
              <AssetGroup key={cls} cls={cls} assets={assets} totalPatrimonio={totalPatrimonio} defaultOpen={i === 0} onSell={setDeleteTarget} />
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <DeleteAssetModal
          asset={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}
