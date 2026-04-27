'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type SidebarMode = 'expanded' | 'compact' | 'hidden'

interface SidebarContextType {
  mode: SidebarMode
  setMode: (m: SidebarMode) => void
  toggleCompact: () => void
  hide: () => void
  show: () => void
}

const SidebarContext = createContext<SidebarContextType>({
  mode: 'expanded',
  setMode: () => {},
  toggleCompact: () => {},
  hide: () => {},
  show: () => {},
})

const STORAGE_KEY = 'sidebarMode'

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SidebarMode>('expanded')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as SidebarMode | null
    if (saved && ['expanded', 'compact', 'hidden'].includes(saved)) {
      setModeState(saved)
    }
  }, [])

  const setMode = (m: SidebarMode) => {
    setModeState(m)
    localStorage.setItem(STORAGE_KEY, m)
  }

  const toggleCompact = () => setMode(mode === 'expanded' ? 'compact' : 'expanded')
  const hide = () => setMode('hidden')
  // Ao mostrar, restaura para expandido (último estado visível padrão)
  const show = () => setMode('expanded')

  return (
    <SidebarContext.Provider value={{ mode, setMode, toggleCompact, hide, show }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
