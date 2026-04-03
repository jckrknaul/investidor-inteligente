'use client'
import { ReactNode, useState, useEffect } from 'react'
import { SessionContext } from '@/lib/store'

interface Session {
  userId: string
  walletId: string
  userName: string
}

export function Providers({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null)

  useEffect(() => {
    const userId = localStorage.getItem('userId')
    const walletId = localStorage.getItem('walletId')
    const userName = localStorage.getItem('userName')
    if (userId && walletId && userName) {
      setSessionState({ userId, walletId, userName })
    }
  }, [])

  const setSession = (s: Session) => {
    localStorage.setItem('userId', s.userId)
    localStorage.setItem('walletId', s.walletId)
    localStorage.setItem('userName', s.userName)
    setSessionState(s)
  }

  const clearSession = () => {
    localStorage.removeItem('userId')
    localStorage.removeItem('walletId')
    localStorage.removeItem('userName')
    setSessionState(null)
  }

  return (
    <SessionContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  )
}
