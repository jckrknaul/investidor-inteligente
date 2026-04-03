'use client'
import { useState } from 'react'

interface AssetLogoProps {
  ticker: string
  size?: number
}

export function AssetLogo({ ticker, size = 28 }: AssetLogoProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className="rounded-full bg-bg-hover border border-border flex items-center justify-center text-text-secondary font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {ticker.slice(0, 2)}
      </span>
    )
  }

  return (
    <img
      src={`https://icons.brapi.dev/icons/${ticker}.svg`}
      alt={ticker}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="rounded-full border border-border bg-white shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  )
}
