'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Session {
  userId: string
  walletId: string
  userName: string
}

interface SessionContextType {
  session: Session | null
  setSession: (s: Session) => void
  clearSession: () => void
}

export const SessionContext = createContext<SessionContextType>({
  session: null,
  setSession: () => {},
  clearSession: () => {},
})

export function useSession() {
  return useContext(SessionContext)
}
