'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency, formatPercent, ASSET_CLASS_LABELS } from '@/lib/formatters'
import { VariationBadge, AssetClassBadge } from '@/components/ui/Badge'
import { AssetLogo } from '@/components/ui/AssetLogo'

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
}

interface AssetTableProps {
  groupedAssets: Record<string, Asset[]>
  totalPatrimonio: number
}

function AssetRow({ asset, totalPatrimonio }: { asset: Asset; totalPatrimonio: number }) {
  const pctCarteira = totalPatrimonio > 0 ? (asset.currentValue / totalPatrimonio) * 100 : 0

  return (
    <tr className="border-t border-border hover:bg-bg-hover transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <AssetLogo ticker={asset.ticker} size={26} />
          <span className="font-semibold text-text-primary text-sm">{asset.ticker}</span>
          {asset.subtype && (
            <span className="text-xs text-text-muted bg-bg-primary px-1.5 py-0.5 rounded">
              {asset.subtype}
            </span>
          )}
        </div>
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
      <td className="px-4 py-3 text-right text-text-primary text-sm font-semibold">{formatCurrency(asset.currentValue)}</td>
      <td className="px-4 py-3 text-right text-text-secondary text-sm">{pctCarteira.toFixed(2)}%</td>
    </tr>
  )
}

function AssetGroup({ cls, assets, totalPatrimonio }: { cls: string; assets: Asset[]; totalPatrimonio: number }) {
  const [open, setOpen] = useState(true)
  const groupValue = assets.reduce((s, a) => s + a.currentValue, 0)
  const groupGain = assets.reduce((s, a) => s + a.gain, 0)
  const groupPct = totalPatrimonio > 0 ? (groupValue / totalPatrimonio) * 100 : 0

  return (
    <>
      <tr
        className="bg-bg-primary/50 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 font-semibold text-text-primary" colSpan={2}>
          <div className="flex items-center gap-2">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <AssetClassBadge cls={cls} />
            <span className="text-sm">{ASSET_CLASS_LABELS[cls] ?? cls}</span>
            <span className="text-text-muted text-xs">({assets.length})</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-text-secondary text-sm" colSpan={3}>
          Ganho: <span className={groupGain >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(groupGain)}</span>
        </td>
        <td className="px-4 py-3 text-right text-text-primary text-sm font-semibold">{formatCurrency(groupValue)}</td>
        <td className="px-4 py-3 text-right text-text-secondary text-sm">{groupPct.toFixed(2)}%</td>
      </tr>
      {open && assets.map(a => <AssetRow key={a.assetId} asset={a} totalPatrimonio={totalPatrimonio} />)}
    </>
  )
}

export function AssetTable({ groupedAssets, totalPatrimonio }: AssetTableProps) {
  const clsOrder = ['STOCK', 'FII', 'FIXED_INCOME', 'TREASURY', 'CRYPTO']
  const sorted = Object.entries(groupedAssets).sort(
    ([a], [b]) => clsOrder.indexOf(a) - clsOrder.indexOf(b)
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left">Ativo</th>
            <th className="px-4 py-3 text-right">Qtd</th>
            <th className="px-4 py-3 text-right">Preço Médio</th>
            <th className="px-4 py-3 text-right">Preço Atual</th>
            <th className="px-4 py-3 text-right">Variação</th>
            <th className="px-4 py-3 text-right">Ganho</th>
            <th className="px-4 py-3 text-right">Saldo</th>
            <th className="px-4 py-3 text-right">% Carteira</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([cls, assets]) => (
            <AssetGroup key={cls} cls={cls} assets={assets} totalPatrimonio={totalPatrimonio} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
