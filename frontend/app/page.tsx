'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const walletId = localStorage.getItem('walletId')
    if (walletId) {
      router.replace('/dashboard')
    } else {
      router.replace('/login')
    }
  }, [router])
  return null
}
