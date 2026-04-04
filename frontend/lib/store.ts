'use client'
import { createContext, useContext } from 'react'

interface Session {
  userId: string
  walletId: string
  userName: string
}

interface SessionContextType {
  session: Session | null
  setSession: (s: Session) => void
  clearSession: () => void
  switchWallet: (walletId: string) => void
}

export const SessionContext = createContext<SessionContextType>({
  session: null,
  setSession: () => {},
  clearSession: () => {},
  switchWallet: () => {},
})

export function useSession() {
  return useContext(SessionContext)
}
