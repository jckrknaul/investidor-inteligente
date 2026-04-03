'use client'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { useSession } from '@/lib/store'

export function AppLayout({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session === null && typeof window !== 'undefined') {
      const walletId = localStorage.getItem('walletId')
      if (!walletId) router.push('/login')
    }
  }, [session, router])

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar />
      <main className="flex-1 ml-56 p-6 overflow-auto">{children}</main>
    </div>
  )
}
