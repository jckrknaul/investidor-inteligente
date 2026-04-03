import clsx from 'clsx'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={clsx('bg-bg-secondary border border-border rounded-xl p-5', className)}>
      {children}
    </div>
  )
}
