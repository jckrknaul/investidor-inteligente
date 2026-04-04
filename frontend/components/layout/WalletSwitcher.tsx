'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2, Check, X, Wallet } from 'lucide-react'
import { useSession } from '@/lib/store'
import { walletsApi } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface WalletItem {
  id: string
  name: string
}

export function WalletSwitcher() {
  const { session, switchWallet } = useSession()
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    if (!session?.userId) return
    const data = await walletsApi.list(session.userId)
    setWallets(data)
  }

  useEffect(() => { load() }, [session?.userId])

  const currentWallet = wallets.find(w => w.id === session?.walletId)

  const handleSwitch = (wallet: WalletItem) => {
    switchWallet(wallet.id)
    setOpen(false)
    // Reload the page to refresh all data for the new wallet
    window.location.reload()
  }

  const handleCreate = async () => {
    if (!newName.trim() || !session?.userId) return
    const wallet = await walletsApi.create(session.userId, newName.trim())
    setNewName('')
    setCreating(false)
    await load()
    handleSwitch(wallet)
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    await walletsApi.rename(id, editName.trim())
    setEditingId(null)
    await load()
  }

  const handleDelete = async () => {
    const id = confirmDeleteId
    if (!id) return
    setConfirmDeleteId(null)
    try {
      await walletsApi.remove(id)
      await load()
      if (id === session?.walletId) {
        const remaining = wallets.filter(w => w.id !== id)
        if (remaining.length) handleSwitch(remaining[0])
      }
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Erro ao excluir carteira')
    }
  }

  if (!session) return null

  return (
    <div className="relative px-3 pb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-primary border border-border text-sm text-text-primary hover:border-accent transition-colors"
      >
        <Wallet size={14} className="text-text-muted shrink-0" />
        <span className="flex-1 text-left truncate text-xs font-medium">{currentWallet?.name ?? 'Carteira'}</span>
        <ChevronDown size={14} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {wallets.map(wallet => (
              <div key={wallet.id} className="group flex items-center gap-1 px-2 py-1.5 hover:bg-bg-hover">
                {editingId === wallet.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(wallet.id); if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 bg-bg-primary border border-border rounded px-2 py-0.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                    />
                    <button onClick={() => handleRename(wallet.id)} className="text-green-400 hover:text-green-300 p-0.5"><Check size={13} /></button>
                    <button onClick={() => setEditingId(null)} className="text-text-muted hover:text-text-primary p-0.5"><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleSwitch(wallet)}
                      className="flex-1 flex items-center gap-2 text-left text-xs text-text-primary truncate"
                    >
                      {wallet.id === session.walletId && <Check size={12} className="text-accent shrink-0" />}
                      <span className={wallet.id === session.walletId ? 'font-semibold text-accent' : ''}>{wallet.name}</span>
                    </button>
                    <button
                      onClick={() => { setEditingId(wallet.id); setEditName(wallet.name) }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent p-0.5 transition-opacity"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => { setOpen(false); setConfirmDeleteId(wallet.id) }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 p-0.5 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-border p-2">
            {creating ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                  placeholder="Nome da carteira"
                  className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <button onClick={handleCreate} className="text-green-400 hover:text-green-300 p-1"><Check size={13} /></button>
                <button onClick={() => setCreating(false)} className="text-text-muted hover:text-text-primary p-1"><X size={13} /></button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 text-xs text-text-secondary hover:text-accent transition-colors px-1 py-0.5"
              >
                <Plus size={13} />
                Nova carteira
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir carteira"
        description="Todos os lançamentos, proventos e ativos desta carteira serão removidos permanentemente. Esta ação não pode ser desfeita."
        confirmLabel="Excluir carteira"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
