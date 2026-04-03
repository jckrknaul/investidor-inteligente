'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowLeftRight, Coins, LogOut } from 'lucide-react'
import { useSession } from '@/lib/store'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Resumo' },
  { href: '/transactions', icon: ArrowLeftRight, label: 'Lançamentos' },
  { href: '/dividends', icon: Coins, label: 'Proventos' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { session, clearSession } = useSession()
  const router = useRouter()

  const logout = () => {
    clearSession()
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-bg-secondary border-r border-border flex flex-col z-40">
      <div className="p-5 border-b border-border">
        <h1 className="text-lg font-bold text-text-primary">💼 Carteira</h1>
        {session && (
          <p className="text-xs text-text-secondary mt-0.5 truncate">{session.userName}</p>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname === href
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-red-400 hover:bg-bg-hover w-full transition-colors"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </aside>
  )
}
