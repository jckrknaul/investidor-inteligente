'use client'
import { ReactNode, useState, useEffect } from 'react'
import { SessionContext } from '@/lib/store'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from '@/lib/theme'
import { SidebarProvider } from '@/lib/sidebar'

interface Session {
  userId: string
  walletId: string
  userName: string
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

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

  const switchWallet = (walletId: string) => {
    localStorage.setItem('walletId', walletId)
    setSessionState(s => s ? { ...s, walletId } : null)
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <SidebarProvider>
          <SessionContext.Provider value={{ session, setSession, clearSession, switchWallet }}>
            {children}
          </SessionContext.Provider>
        </SidebarProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  )
}
