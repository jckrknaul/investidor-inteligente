'use client'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { AssetClassBadge } from '@/components/ui/Badge'
import { dividendsApi } from '@/lib/api'
import { formatCurrency, formatDate, DIVIDEND_TYPE_LABELS } from '@/lib/formatters'
import { AssetLogo } from '@/components/ui/AssetLogo'
import { RefreshCw, TrendingUp } from 'lucide-react'

export default function DividendsPage() {
  const [dividends, setDividends] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [walletId, setWalletId] = useState('')

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
  const hasPayDate = (d: any) => d.payDate.slice(0, 10) !== d.exDate.slice(0, 10)

  const totalReceived = dividends
    .filter(d => hasPayDate(d) && new Date(d.payDate) <= now && new Date(d.payDate).getFullYear() === now.getFullYear())
    .reduce((s, d) => s + Number(d.totalValue), 0)

  const totalPending = dividends
    .filter(d => hasPayDate(d) && new Date(d.payDate) > now)
    .reduce((s, d) => s + Number(d.totalValue), 0)

  const total12M = (() => {
    const ago = new Date()
    ago.setMonth(ago.getMonth() - 12)
    return dividends
      .filter(d => hasPayDate(d) && new Date(d.payDate) >= ago && new Date(d.payDate) <= now)
      .reduce((s, d) => s + Number(d.totalValue), 0)
  })()

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await dividendsApi.sync(walletId)
      setSyncMsg(
        result.inserted > 0
          ? `${result.inserted} provento(s) importado(s).`
          : 'Nenhum provento novo encontrado.'
      )
      if (result.inserted > 0) await load()
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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-green-400" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Recebido em {now.getFullYear()}</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(totalReceived)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">A receber</p>
              <p className="text-xl font-bold text-yellow-400">{formatCurrency(totalPending)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Recebido — 12 meses</p>
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
            <p>Nenhum provento encontrado.</p>
            <button onClick={handleSync} className="text-accent hover:underline">
              Sincronizar agora
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
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {dividends.map((d: any) => {
                const received = hasPayDate(d) && new Date(d.payDate) <= now
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
                        {DIVIDEND_TYPE_LABELS[d.type as keyof typeof DIVIDEND_TYPE_LABELS] ?? d.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">{formatDate(d.exDate)}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {d.payDate.slice(0, 10) !== d.exDate.slice(0, 10) ? formatDate(d.payDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(Number(d.valuePerUnit))}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">{Number(d.quantity)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${!hasPayDate(d) ? 'text-text-secondary' : received ? 'text-green-400' : 'text-yellow-400'}`}>
                      {formatCurrency(Number(d.totalValue))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!hasPayDate(d) ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-bg-hover text-text-muted">
                          Sem data
                        </span>
                      ) : received ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/15 text-green-400">
                          Recebido
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/15 text-yellow-400">
                          A receber
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </AppLayout>
  )
}
