'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ArrowLeftRight, Coins, TrendingUp,
  Globe, Calculator, Scale, Crosshair, LogOut, Sun, Moon,
  ChevronsLeft, ChevronsRight, X, GripVertical, RotateCcw,
} from 'lucide-react'
import { useSession } from '@/lib/store'
import { useTheme } from '@/lib/theme'
import { useSidebar } from '@/lib/sidebar'
import { WalletSwitcher } from './WalletSwitcher'
import { Logo } from '@/components/ui/Logo'
import clsx from 'clsx'

interface NavItem {
  href: string
  icon: typeof Globe
  label: string
}

const DEFAULT_NAV: NavItem[] = [
  { href: '/panorama', icon: Globe, label: 'Panorama' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Resumo' },
  { href: '/transactions', icon: ArrowLeftRight, label: 'Lançamentos' },
  { href: '/dividends', icon: Coins, label: 'Proventos' },
  { href: '/performance', icon: TrendingUp, label: 'Rentabilidade' },
  { href: '/ceiling-price-projection', icon: Crosshair, label: 'Preço Teto Proj.' },
  { href: '/projection', icon: Calculator, label: 'Projeção' },
  { href: '/valuation', icon: Scale, label: 'Valuation' },
]

const ORDER_STORAGE_KEY = 'sidebarOrder'

function loadOrderedNav(): NavItem[] {
  if (typeof window === 'undefined') return DEFAULT_NAV
  try {
    const saved = localStorage.getItem(ORDER_STORAGE_KEY)
    if (!saved) return DEFAULT_NAV
    const order: string[] = JSON.parse(saved)
    if (!Array.isArray(order)) return DEFAULT_NAV
    const byHref = new Map(DEFAULT_NAV.map(it => [it.href, it]))
    const ordered: NavItem[] = []
    for (const href of order) {
      const item = byHref.get(href)
      if (item) {
        ordered.push(item)
        byHref.delete(href)
      }
    }
    // Adiciona itens novos (não presentes na ordem salva) ao final
    for (const remaining of byHref.values()) ordered.push(remaining)
    return ordered
  } catch {
    return DEFAULT_NAV
  }
}

function saveOrder(items: NavItem[]) {
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(items.map(i => i.href)))
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { session, clearSession } = useSession()
  const { theme, toggleTheme } = useTheme()
  const { mode, toggleCompact, hide } = useSidebar()

  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  // Carrega ordem persistida no client side
  useEffect(() => {
    setNav(loadOrderedNav())
  }, [])

  if (mode === 'hidden') return null

  const compact = mode === 'compact'

  const logout = () => {
    clearSession()
    router.push('/login')
  }

  const resetOrder = () => {
    setNav(DEFAULT_NAV)
    localStorage.removeItem(ORDER_STORAGE_KEY)
  }

  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    // Necessário em alguns navegadores para o drag funcionar
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropIdx !== idx) setDropIdx(idx)
  }

  const onDragLeave = () => {
    // o dragLeave é disparado ao mover entre filhos; mantemos dropIdx até o drop/end
  }

  const onDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null)
      setDropIdx(null)
      return
    }
    const next = [...nav]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    setNav(next)
    saveOrder(next)
    setDragIdx(null)
    setDropIdx(null)
  }

  const onDragEnd = () => {
    setDragIdx(null)
    setDropIdx(null)
  }

  const isReordered = JSON.stringify(nav.map(n => n.href)) !== JSON.stringify(DEFAULT_NAV.map(n => n.href))

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-screen bg-bg-secondary border-r border-border flex flex-col z-40 transition-all duration-200',
        compact ? 'w-14' : 'w-56',
      )}
    >
      {/* Header com toggle/hide */}
      <div className={clsx('border-b border-border', compact ? 'p-2' : 'px-4 py-4')}>
        <div className={clsx('flex items-center', compact ? 'flex-col gap-2' : 'justify-between gap-2')}>
          {compact ? (
            <Logo size={24} showText={false} />
          ) : (
            <Logo size={28} />
          )}
          <div className={clsx('flex gap-1', compact ? 'flex-col' : 'items-center')}>
            <button
              onClick={toggleCompact}
              title={compact ? 'Expandir menu' : 'Reduzir menu'}
              className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
            >
              {compact ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
            {!compact && (
              <button
                onClick={hide}
                title="Ocultar menu"
                className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        {!compact && session && (
          <p className="text-xs text-text-secondary mt-2 truncate">{session.userName}</p>
        )}
      </div>

      {!compact && <WalletSwitcher />}

      <nav className={clsx('flex-1 space-y-1 overflow-y-auto', compact ? 'p-2' : 'p-3')}>
        {nav.map(({ href, icon: Icon, label }, idx) => {
          const isActive = pathname === href
          const isDragging = dragIdx === idx
          const isDropTarget = dropIdx === idx && dragIdx !== null && dragIdx !== idx
          return (
            <div
              key={href}
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              onClick={() => router.push(href)}
              title={compact ? label : 'Arraste para reordenar'}
              className={clsx(
                'group flex items-center rounded-lg text-sm font-medium transition-colors cursor-pointer select-none',
                compact ? 'justify-center p-2.5' : 'gap-2 px-2.5 py-2.5',
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                isDragging && 'opacity-40',
                isDropTarget && 'ring-2 ring-accent/60',
              )}
            >
              {!compact && (
                <GripVertical
                  size={14}
                  className="text-text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing"
                />
              )}
              <Icon size={18} className="shrink-0" />
              {!compact && <span className="truncate">{label}</span>}
            </div>
          )
        })}
        {!compact && isReordered && (
          <button
            onClick={resetOrder}
            title="Restaurar ordem padrão"
            className="w-full flex items-center gap-2 px-2.5 py-1.5 mt-2 rounded-lg text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <RotateCcw size={12} />
            Restaurar ordem padrão
          </button>
        )}
      </nav>

      <div className={clsx('border-t border-border space-y-1', compact ? 'p-2' : 'p-3')}>
        <button
          onClick={toggleTheme}
          title={compact ? (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro') : undefined}
          className={clsx(
            'flex items-center rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover w-full transition-colors',
            compact ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!compact && (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro')}
        </button>
        <button
          onClick={logout}
          title={compact ? 'Sair' : undefined}
          className={clsx(
            'flex items-center rounded-lg text-sm text-text-secondary hover:text-red-400 hover:bg-bg-hover w-full transition-colors',
            compact ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          <LogOut size={18} />
          {!compact && 'Sair'}
        </button>
      </div>
    </aside>
  )
}
