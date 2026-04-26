// Helpers para taxas macro (CDI e IPCA) — usados no cálculo de rentabilidade de Renda Fixa.

const BCB_FMT = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

const CDI_FALLBACK = 11.75
const IPCA_FALLBACK = 4.5

let cdiCache: { value: number; ts: number } | null = null
let ipcaCache: { value: number; ts: number } | null = null
const CACHE_TTL_MS = 1000 * 60 * 60 * 6 // 6h

// Cache de séries diárias do CDI (chave: yyyy-mm-dd inicio)
const cdiDailyCache = new Map<string, { data: { date: string; rate: number }[]; ts: number }>()
// Cache de séries mensais do IPCA
const ipcaMonthlyCache = new Map<string, { data: { ym: string; rate: number }[]; ts: number }>()

export async function fetchCurrentCdiAnnual(): Promise<number> {
  if (cdiCache && Date.now() - cdiCache.ts < CACHE_TTL_MS) return cdiCache.value
  try {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 40)
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${BCB_FMT(from)}&dataFinal=${BCB_FMT(to)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return CDI_FALLBACK
    const data = await res.json() as { data: string; valor: string }[]
    if (!data.length) return CDI_FALLBACK
    let compound = 1
    for (const item of data.slice(-21)) {
      const daily = Number(item.valor.replace(',', '.')) / 100
      compound *= (1 + daily)
    }
    const monthly = compound - 1
    const annual = (Math.pow(1 + monthly, 12) - 1) * 100
    const rounded = Math.round(annual * 100) / 100
    cdiCache = { value: rounded, ts: Date.now() }
    return rounded
  } catch {
    return CDI_FALLBACK
  }
}

// IPCA acumulado nos últimos 12 meses (% a.a.) — série 433 (IPCA mensal %)
export async function fetchCurrentIpcaAnnual(): Promise<number> {
  if (ipcaCache && Date.now() - ipcaCache.ts < CACHE_TTL_MS) return ipcaCache.value
  try {
    const to = new Date()
    const from = new Date()
    from.setMonth(from.getMonth() - 13)
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${BCB_FMT(from)}&dataFinal=${BCB_FMT(to)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return IPCA_FALLBACK
    const data = await res.json() as { data: string; valor: string }[]
    if (!data.length) return IPCA_FALLBACK
    let compound = 1
    for (const item of data.slice(-12)) {
      const monthly = Number(item.valor.replace(',', '.')) / 100
      compound *= (1 + monthly)
    }
    const annual = (compound - 1) * 100
    const rounded = Math.round(annual * 100) / 100
    ipcaCache = { value: rounded, ts: Date.now() }
    return rounded
  } catch {
    return IPCA_FALLBACK
  }
}

// Busca a série diária do CDI (taxa diária %) entre duas datas, retornando lista ordenada.
export async function fetchCdiDaily(from: Date, to: Date): Promise<{ date: string; rate: number }[]> {
  const cacheKey = `${from.toISOString().slice(0, 10)}|${to.toISOString().slice(0, 10)}`
  const cached = cdiDailyCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${BCB_FMT(from)}&dataFinal=${BCB_FMT(to)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json() as { data: string; valor: string }[]
    const out = data.map(item => {
      const [dd, mm, yyyy] = item.data.split('/')
      return { date: `${yyyy}-${mm}-${dd}`, rate: Number(item.valor.replace(',', '.')) }
    })
    cdiDailyCache.set(cacheKey, { data: out, ts: Date.now() })
    return out
  } catch {
    return []
  }
}

// Busca a série mensal do IPCA (% mês) entre duas datas.
export async function fetchIpcaMonthly(from: Date, to: Date): Promise<{ ym: string; rate: number }[]> {
  const cacheKey = `${from.toISOString().slice(0, 7)}|${to.toISOString().slice(0, 7)}`
  const cached = ipcaMonthlyCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${BCB_FMT(from)}&dataFinal=${BCB_FMT(to)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json() as { data: string; valor: string }[]
    const out = data.map(item => {
      const [, mm, yyyy] = item.data.split('/')
      return { ym: `${yyyy}-${mm}`, rate: Number(item.valor.replace(',', '.')) }
    })
    ipcaMonthlyCache.set(cacheKey, { data: out, ts: Date.now() })
    return out
  } catch {
    return []
  }
}

/**
 * Calcula o valor projetado de um título de renda fixa, dado:
 * - principal investido
 * - data da compra
 * - indexador (CDI / IPCA / Prefixado / Selic)
 * - taxa contratada (em % — interpretação depende do indexador)
 *
 * Convenções:
 * - CDI / Selic: rate é o "% do CDI" contratado (ex: 110 = 110% do CDI)
 *   — acumula o CDI dia a dia da BCB e aplica o % contratado em cada dia
 * - IPCA: rate é o spread sobre o IPCA (ex: 6 = IPCA + 6%)
 *   — acumula o IPCA mês a mês + juros prefixados pro-rata
 * - Prefixado: rate é a taxa anual contratada (ex: 12 = 12% a.a.)
 *
 * Os parâmetros cdiDaily e ipcaMonthly são opcionais — se não passados,
 * cai no cálculo aproximado usando cdiAnnual/ipcaAnnual.
 */
export function projectFixedIncomeValue(params: {
  principal: number
  purchaseDate: Date
  indexer: string | null
  rate: number | null
  cdiAnnual: number
  ipcaAnnual: number
  cdiDaily?: { date: string; rate: number }[]
  ipcaMonthly?: { ym: string; rate: number }[]
  asOf?: Date
}): number {
  const { principal, purchaseDate, indexer, rate, cdiAnnual, ipcaAnnual, cdiDaily, ipcaMonthly } = params
  if (!principal || principal <= 0) return 0
  const asOf = params.asOf ?? new Date()
  if (asOf <= purchaseDate) return principal
  const yearsElapsed = Math.max(0, (asOf.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  if (yearsElapsed === 0) return principal

  const r = rate ?? 0
  const idx = (indexer ?? '').toUpperCase()
  const purchaseStr = purchaseDate.toISOString().slice(0, 10)
  const asOfStr = asOf.toISOString().slice(0, 10)

  // CDI / Selic — acumula taxa diária real até asOf
  if (idx === 'CDI' || idx === 'SELIC') {
    if (cdiDaily && cdiDaily.length) {
      const pct = r > 0 ? r / 100 : 1
      let acc = 1
      for (const d of cdiDaily) {
        if (d.date < purchaseStr) continue
        if (d.date > asOfStr) break
        const daily = d.rate / 100
        acc *= (1 + daily * pct)
      }
      return principal * acc
    }
    const annualYield = cdiAnnual * (r > 0 ? r / 100 : 1)
    return principal * Math.pow(1 + annualYield / 100, yearsElapsed)
  }

  // IPCA — acumula IPCA mensal real + spread prefixado pro-rata até asOf
  if (idx === 'IPCA') {
    if (ipcaMonthly && ipcaMonthly.length) {
      const purchaseYm = purchaseStr.slice(0, 7)
      const asOfYm = asOfStr.slice(0, 7)
      let accIpca = 1
      for (const m of ipcaMonthly) {
        if (m.ym < purchaseYm) continue
        if (m.ym > asOfYm) break
        accIpca *= (1 + m.rate / 100)
      }
      const accSpread = Math.pow(1 + r / 100, yearsElapsed)
      return principal * accIpca * accSpread
    }
    const annualYield = ipcaAnnual + r
    return principal * Math.pow(1 + annualYield / 100, yearsElapsed)
  }

  // Prefixado
  if (idx === 'PREFIXADO' || idx === '') {
    return principal * Math.pow(1 + r / 100, yearsElapsed)
  }

  return principal * Math.pow(1 + r / 100, yearsElapsed)
}
