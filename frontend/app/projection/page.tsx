'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { dashboardApi, projectionApi, getWalletId, type ProjectionData } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import { Calculator, ChevronDown, ChevronUp, TrendingUp, Wallet, PiggyBank, BarChart3, Save, Check, Loader2 } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface YearResult {
  year: number
  saldoInicial: number[]
  aportes: number[]
  rentabilidades: number[]
  rendimentos: number[]
  totais: number[]
  totalAportes: number
  totalRendimentos: number
}

const parseNum = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
const numToStr = (v: number) => v.toFixed(2).replace('.', ',')

function calcProjection(
  patrimonioInicial: number,
  anos: number,
  getAporte: (y: number, m: number) => number,
  getRent: (y: number, m: number) => number,
  startYear: number,
): YearResult[] {
  const results: YearResult[] = []
  let carry = patrimonioInicial

  for (let y = 0; y < anos; y++) {
    const row: YearResult = {
      year: startYear + y,
      saldoInicial: [], aportes: [], rentabilidades: [],
      rendimentos: [], totais: [],
      totalAportes: 0, totalRendimentos: 0,
    }

    for (let m = 0; m < 12; m++) {
      const saldo = carry
      const aporte = getAporte(y, m)
      const rent = getRent(y, m) / 100
      const rendimento = saldo * rent
      const total = saldo + aporte + rendimento

      row.saldoInicial.push(saldo)
      row.aportes.push(aporte)
      row.rentabilidades.push(getRent(y, m))
      row.rendimentos.push(rendimento)
      row.totais.push(total)
      row.totalAportes += aporte
      row.totalRendimentos += rendimento
      carry = total
    }
    results.push(row)
  }
  return results
}

// Editable cell that stores its own string state while editing
function EditableCell({ value, onChange, color, suffix, width }: {
  value: number; onChange: (v: number) => void
  color: string; suffix?: string; width?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  const startEdit = () => {
    setText(numToStr(value))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const parsed = parseNum(text)
    if (parsed !== value) onChange(parsed)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className={`bg-bg-primary text-right outline-none border border-accent rounded px-1 py-0.5 ${color} ${width ?? 'w-20'}`}
        />
        {suffix && <span className="text-text-muted ml-0.5">{suffix}</span>}
      </span>
    )
  }

  return (
    <span
      onClick={startEdit}
      className={`cursor-pointer hover:bg-bg-hover rounded px-1 py-0.5 transition-colors ${color}`}
    >
      {numToStr(value)}{suffix}
    </span>
  )
}

const LEGACY_STORAGE_KEY = 'projection_data'

function readLegacyLocal(): ProjectionData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      patrimonio: String(parsed.patrimonio ?? '0'),
      anos: Number(parsed.anos ?? 3),
      defaultAporte: String(parsed.defaultAporte ?? '5000'),
      defaultRent: String(parsed.defaultRent ?? '1,00'),
      aporteOverrides: parsed.aporteOverrides ?? {},
      rentOverrides: parsed.rentOverrides ?? {},
    }
  } catch { return null }
}

export default function ProjectionPage() {
  const [patrimonio, setPatrimonio] = useState('0')
  const [anos, setAnos] = useState(3)
  const [defaultAporte, setDefaultAporte] = useState('5000')
  const [defaultRent, setDefaultRent] = useState('1,00')
  const [aporteOverrides, setAporteOverrides] = useState<Record<string, number>>({})
  const [rentOverrides, setRentOverrides] = useState<Record<string, number>>({})
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingPatrimonio, setLoadingPatrimonio] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const applyData = useCallback((data: ProjectionData) => {
    setPatrimonio(data.patrimonio)
    setAnos(data.anos)
    setDefaultAporte(data.defaultAporte)
    setDefaultRent(data.defaultRent)
    setAporteOverrides(data.aporteOverrides ?? {})
    setRentOverrides(data.rentOverrides ?? {})
  }, [])

  // Load projection from backend (with one-time legacy localStorage migration)
  useEffect(() => {
    const walletId = getWalletId()
    if (!walletId) { setLoading(false); return }

    let cancelled = false
    ;(async () => {
      try {
        const remote = await projectionApi.get(walletId)
        if (cancelled) return

        if (remote) {
          applyData(remote)
          setLoading(false)
          return
        }

        // No remote projection — try migrating from legacy localStorage
        const legacy = readLegacyLocal()
        if (legacy) {
          try {
            await projectionApi.save(walletId, legacy)
            localStorage.removeItem(LEGACY_STORAGE_KEY)
            if (!cancelled) applyData(legacy)
          } catch {}
          setLoading(false)
          return
        }

        // Nothing saved yet — preload patrimônio from dashboard
        setLoadingPatrimonio(true)
        try {
          const d: any = await dashboardApi.get(walletId, '12m')
          if (!cancelled && d?.kpis?.totalPatrimonio) {
            setPatrimonio(numToStr(d.kpis.totalPatrimonio))
          }
        } catch {}
        finally {
          if (!cancelled) setLoadingPatrimonio(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [applyData])

  const handleSave = async () => {
    const walletId = getWalletId()
    if (!walletId) return
    setSaveStatus('saving')
    try {
      await projectionApi.save(walletId, {
        patrimonio, anos, defaultAporte, defaultRent, aporteOverrides, rentOverrides,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const startYear = new Date().getFullYear()
  const defAporte = parseNum(defaultAporte)
  const defRent = parseNum(defaultRent)

  const getAporte = useCallback((y: number, m: number) => aporteOverrides[`${y}-${m}`] ?? defAporte, [aporteOverrides, defAporte])
  const getRent = useCallback((y: number, m: number) => rentOverrides[`${y}-${m}`] ?? defRent, [rentOverrides, defRent])

  const results = useMemo(
    () => calcProjection(parseNum(patrimonio), anos, getAporte, getRent, startYear),
    [patrimonio, anos, getAporte, getRent, startYear]
  )

  const finalValue = results.length > 0 ? results[results.length - 1].totais[11] : parseNum(patrimonio)
  const totalAportes = results.reduce((s, r) => s + r.totalAportes, 0)
  const totalRendimentos = results.reduce((s, r) => s + r.totalRendimentos, 0)

  const toggleExpand = (y: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev)
      next.has(y) ? next.delete(y) : next.add(y)
      return next
    })
  }

  const setAporteMonth = (y: number, m: number, v: number) => {
    setAporteOverrides(prev => ({ ...prev, [`${y}-${m}`]: v }))
  }
  const setRentMonth = (y: number, m: number, v: number) => {
    setRentOverrides(prev => ({ ...prev, [`${y}-${m}`]: v }))
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Calculator size={22} /> Projeção Financeira
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">Simule o crescimento do seu patrimônio</p>
        </div>
        <button onClick={handleSave} disabled={saveStatus === 'saving' || loading}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-60 ${
            saveStatus === 'saved'
              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
              : saveStatus === 'error'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'bg-accent text-white hover:opacity-90'
          }`}>
          {saveStatus === 'saving'
            ? <Loader2 size={15} className="animate-spin" />
            : saveStatus === 'saved'
              ? <Check size={15} />
              : <Save size={15} />}
          {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'saved' ? 'Salvo' : saveStatus === 'error' ? 'Erro' : 'Salvar'}
        </button>
      </div>

      {/* Inputs */}
      <Card className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Patrimônio Inicial</label>
            <div className="flex items-center bg-bg-primary border border-border rounded-lg overflow-hidden">
              <span className="text-xs text-text-muted pl-3">R$</span>
              <input type="text" inputMode="decimal"
                value={loadingPatrimonio ? 'Carregando...' : patrimonio}
                onChange={e => setPatrimonio(e.target.value)}
                className="bg-transparent text-text-primary outline-none py-2 px-3 text-sm flex-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Aporte Mensal (padrão)</label>
            <div className="flex items-center bg-bg-primary border border-border rounded-lg overflow-hidden">
              <span className="text-xs text-text-muted pl-3">R$</span>
              <input type="text" inputMode="decimal"
                value={defaultAporte}
                onChange={e => setDefaultAporte(e.target.value)}
                className="bg-transparent text-text-primary outline-none py-2 px-3 text-sm flex-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Rentabilidade Mensal (padrão)</label>
            <div className="flex items-center bg-bg-primary border border-border rounded-lg overflow-hidden">
              <input type="text" inputMode="decimal"
                value={defaultRent}
                onChange={e => setDefaultRent(e.target.value)}
                className="bg-transparent text-text-primary outline-none py-2 px-3 text-sm flex-1"
              />
              <span className="text-xs text-text-muted pr-3">% a.m.</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Anos de Projeção</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 5, 10].map(n => (
                <button key={n} onClick={() => setAnos(n)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    anos === n ? 'bg-accent text-white' : 'bg-bg-primary border border-border text-text-secondary hover:text-text-primary'
                  }`}>
                  {n}A
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={14} className="text-accent" />
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Patrimônio Final</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(finalValue)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <PiggyBank size={14} className="text-blue-400" />
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Total Aportes</p>
          </div>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(totalAportes)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-green-400" />
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Total Rendimentos</p>
          </div>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(totalRendimentos)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={14} className="text-yellow-400" />
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Ganho Total</p>
          </div>
          <p className="text-2xl font-bold text-yellow-400">
            {formatCurrency(finalValue - parseNum(patrimonio))}
          </p>
        </Card>
      </div>

      {/* Year Tables */}
      <div className="space-y-4">
        {results.map((yr, yIdx) => {
          const isExpanded = expandedYears.has(yIdx)
          return (
            <Card key={yr.year} className="p-0 overflow-hidden">
              <button onClick={() => toggleExpand(yIdx)}
                className="w-full px-5 py-3 border-b border-border flex items-center justify-between hover:bg-bg-hover transition-colors">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-base font-bold text-accent">{yr.year}</span>
                  <span className="text-xs text-text-muted">
                    Início: <span className="text-text-secondary font-medium">{formatCurrency(yr.saldoInicial[0])}</span>
                  </span>
                  <span className="text-xs text-text-muted">
                    Final: <span className="text-green-400 font-medium">{formatCurrency(yr.totais[11])}</span>
                  </span>
                  <span className="text-xs text-text-muted">
                    Aportes: <span className="text-blue-400 font-medium">{formatCurrency(yr.totalAportes)}</span>
                  </span>
                  <span className="text-xs text-text-muted">
                    Rendimentos: <span className="text-green-400 font-medium">{formatCurrency(yr.totalRendimentos)}</span>
                  </span>
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
              </button>

              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-bg-primary">
                        <th className="px-3 py-2.5 text-left text-text-muted font-semibold uppercase tracking-wider w-28 sticky left-0 bg-bg-primary z-10">{yr.year}</th>
                        {MONTHS.map(m => (
                          <th key={m} className="px-3 py-2.5 text-right text-text-muted font-semibold uppercase tracking-wider whitespace-nowrap">{m}</th>
                        ))}
                        <th className="px-3 py-2.5 text-right text-text-muted font-semibold uppercase tracking-wider bg-bg-hover whitespace-nowrap">Total Ano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Saldo */}
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-text-muted font-medium sticky left-0 bg-bg-card z-10"></td>
                        {yr.saldoInicial.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right text-text-secondary whitespace-nowrap">{formatCurrency(v)}</td>
                        ))}
                        <td className="px-3 py-2 text-right bg-bg-hover"></td>
                      </tr>
                      {/* Aporte */}
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-blue-400 font-semibold sticky left-0 bg-bg-card z-10">Aporte</td>
                        {yr.aportes.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right whitespace-nowrap">
                            <EditableCell value={v} onChange={val => setAporteMonth(yIdx, i, val)} color="text-blue-400" width="w-20" />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right bg-bg-hover text-blue-400 font-bold whitespace-nowrap">{formatCurrency(yr.totalAportes)}</td>
                      </tr>
                      {/* Rentabilidade */}
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-yellow-400 font-semibold sticky left-0 bg-bg-card z-10">Rentabilidade</td>
                        {yr.rentabilidades.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right whitespace-nowrap">
                            <EditableCell value={v} onChange={val => setRentMonth(yIdx, i, val)} color="text-yellow-400" suffix="%" width="w-14" />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right bg-bg-hover text-yellow-400 font-bold whitespace-nowrap">
                          {numToStr(yr.rentabilidades.reduce((s, v) => s + v, 0))}%
                        </td>
                      </tr>
                      {/* Rendimento */}
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-green-400 font-semibold sticky left-0 bg-bg-card z-10">Rendimento</td>
                        {yr.rendimentos.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right text-green-400 whitespace-nowrap">{formatCurrency(v)}</td>
                        ))}
                        <td className="px-3 py-2 text-right bg-bg-hover text-green-400 font-bold whitespace-nowrap">{formatCurrency(yr.totalRendimentos)}</td>
                      </tr>
                      {/* Total */}
                      <tr className="bg-bg-primary/50">
                        <td className="px-3 py-2.5 text-text-primary font-bold sticky left-0 bg-bg-primary z-10">Total</td>
                        {yr.totais.map((v, i) => (
                          <td key={i} className="px-3 py-2.5 text-right text-text-primary font-bold whitespace-nowrap">{formatCurrency(v)}</td>
                        ))}
                        <td className="px-3 py-2.5 text-right bg-bg-hover text-accent font-bold whitespace-nowrap">{formatCurrency(yr.totais[11])}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {!isExpanded && (
                <div className="overflow-x-auto">
                  <div className="flex px-5 py-2.5 gap-0">
                    {yr.totais.map((v, i) => (
                      <div key={i} className="flex-1 min-w-[80px] text-center">
                        <p className="text-[10px] text-text-muted">{MONTHS_SHORT[i]}</p>
                        <p className="text-xs text-text-primary font-medium">{formatCurrency(v)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </AppLayout>
  )
}
