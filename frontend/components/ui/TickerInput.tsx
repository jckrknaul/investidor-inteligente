'use client'
import { useState, useEffect, useRef } from 'react'
import { quotesApi } from '@/lib/api'
import { Loader2 } from 'lucide-react'

interface TickerResult {
  ticker: string
  name: string
  type: string
  sector: string | null
}

interface TickerInputProps {
  value: string
  onChange: (ticker: string) => void
  assetClass?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
}

const isFII = (r: TickerResult) =>
  ['fund', 'mutualfund', 'etf'].includes(r.type) || /\d{2}$/.test(r.ticker)

function filterByClass(results: TickerResult[], assetClass?: string): TickerResult[] {
  if (!assetClass) return results
  switch (assetClass) {
    case 'FII':          return results.filter(r => isFII(r))
    case 'STOCK':        return results.filter(r => !isFII(r) && ['equity', 'stock', 'bdr'].includes(r.type))
    case 'CRYPTO':       return results.filter(r => r.type === 'cryptocurrency')
    default:             return results
  }
}

export function TickerInput({ value, onChange, assetClass, disabled, required, placeholder = 'Ex: PETR4' }: TickerInputProps) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<TickerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value (ex: when editing resets the form)
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q || q.length < 1) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const raw = await quotesApi.search(q)
        const data = filterByClass(raw, assetClass)
        setResults(data)
        setOpen(data.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const select = (r: TickerResult) => {
    setQuery(r.ticker)
    onChange(r.ticker)
    setOpen(false)
    setResults([])
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase()
    setQuery(v)
    onChange(v)
    search(v)
  }

  const TYPE_LABELS: Record<string, string> = {
    stock: 'Ação',
    fund: 'FII',
    bdr: 'BDR',
    etf: 'ETF',
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          required={required}
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-2.5 text-text-muted animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map(r => (
            <li
              key={r.ticker}
              onMouseDown={() => select(r)}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-bg-hover cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-text-primary text-sm shrink-0">{r.ticker}</span>
                <span className="text-text-muted text-xs truncate">{r.name}</span>
              </div>
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                {r.sector && (
                  <span className="text-xs text-text-muted hidden sm:inline">{r.sector}</span>
                )}
                <span className="text-xs bg-bg-primary text-text-secondary px-1.5 py-0.5 rounded">
                  {TYPE_LABELS[r.type] ?? r.type}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
