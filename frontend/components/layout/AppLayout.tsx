'use client'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import clsx from 'clsx'
import { Sidebar } from './Sidebar'
import { useSession } from '@/lib/store'
import { useSidebar } from '@/lib/sidebar'

export function AppLayout({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const router = useRouter()
  const { mode, show } = useSidebar()

  useEffect(() => {
    if (session === null && typeof window !== 'undefined') {
      const walletId = localStorage.getItem('walletId')
      if (!walletId) router.push('/login')
    }
  }, [session, router])

  const mainClass = clsx(
    'flex-1 p-6 overflow-auto transition-all duration-200',
    mode === 'expanded' && 'ml-56',
    mode === 'compact' && 'ml-14',
    mode === 'hidden' && 'ml-0',
  )

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar />
      {mode === 'hidden' && (
        <button
          onClick={show}
          title="Mostrar menu"
          className="fixed left-3 top-3 z-50 p-2 rounded-lg bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover shadow-lg transition-colors"
        >
          <Menu size={18} />
        </button>
      )}
      <main className={mainClass}>{children}</main>
    </div>
  )
}
