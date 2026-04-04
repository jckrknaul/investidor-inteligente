import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { calcPositions } from '../services/portfolio'
import { fetchMonthlyHistory, priceAtDate } from '../services/quotes'

const BCB_FMT = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

// CDI: series 12 (daily rate %). Need to compound daily rates into monthly.
async function fetchCdiMonthly(from: Date, to: Date): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${BCB_FMT(from)}&dataFinal=${BCB_FMT(to)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return map
    const data = await res.json() as { data: string; valor: string }[]
    // Compound daily CDI rates into monthly
    const monthly = new Map<string, number>()
    for (const item of data) {
      const [dd, mm, yyyy] = item.data.split('/')
      const key = `${yyyy}-${mm}`
      const dailyRate = Number(item.valor.replace(',', '.')) / 100
      const prev = monthly.get(key) ?? 0
      monthly.set(key, (1 + prev) * (1 + dailyRate) - 1)
    }
    monthly.forEach((v, k) => map.set(k, Math.round(v * 10000) / 100)) // as %
  } catch { /* BCB offline */ }
  return map
}

// IFIX: uses XFIX11.SA (ETF que replica o IFIX) via Yahoo Finance — BCB série 12466 só vai até 2023
async function fetchIfixMonthly(from: Date, _to: Date): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const history = await fetchMonthlyHistory('XFIX11.SA', from)
    if (history.length < 2) return map
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1].close
      const cur = history[i].close
      if (prev > 0) {
        const d = new Date(history[i].ts * 1000)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        map.set(key, Math.round(((cur - prev) / prev) * 10000) / 100)
      }
    }
  } catch { /* ignore */ }
  return map
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))
}

export async function performanceRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/performance', async (req) => {
    const { walletId } = req.params as { walletId: string }

    const transactions = await prisma.transaction.findMany({
      where: { walletId },
      include: { asset: true },
      orderBy: { date: 'asc' },
    })

    if (!transactions.length) {
      return {
        kpis: { totalReturnPct: 0, last12mReturnPct: 0, lastMonthReturnPct: 0, totalVsCdi: 0, last12mVsCdi: 0, lastMonthVsCdi: 0 },
        monthlyTable: [],
        chartSeries: [],
      }
    }

    const firstDate = new Date(transactions[0].date)
    firstDate.setUTCDate(1)
    const now = new Date()

    // Get unique tickers ever held
    const tickers = [...new Set(transactions.map(tx => tx.asset.ticker))]

    // Fetch monthly price history for all tickers + CDI + IBOV + IFIX in parallel
    const [historiesArr, cdiMap, ibovHistory, ifixMap] = await Promise.all([
      Promise.all(tickers.map(async t => ({ ticker: t, history: await fetchMonthlyHistory(t, firstDate) }))),
      fetchCdiMonthly(firstDate, now),
      fetchMonthlyHistory('^BVSP', firstDate),
      fetchIfixMonthly(firstDate, now),
    ])
    const historyMap = new Map(historiesArr.map(h => [h.ticker, h.history]))

    // Helper: compute monthly return of an index from its price history
    function indexMonthlyReturn(history: { ts: number; close: number }[], eomTs: number, prevEomTs: number): number | null {
      const cur = priceAtDate(history, eomTs)
      const prev = priceAtDate(history, prevEomTs)
      if (!cur || !prev || prev === 0) return null
      return ((cur - prev) / prev) * 100
    }

    // Build list of months from first transaction month to current month
    const months: { year: number; month: number }[] = []
    {
      let y = firstDate.getUTCFullYear()
      let m = firstDate.getUTCMonth()
      while (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth())) {
        months.push({ year: y, month: m })
        m++
        if (m > 11) { m = 0; y++ }
      }
    }

    // Calculate portfolio value at end of each month
    const portfolioValues: { key: string; value: number; netFlow: number }[] = []

    for (const { year, month } of months) {
      const eom = endOfMonth(year, month)
      const eomStr = eom.toISOString().slice(0, 10)
      const eomTs = Math.floor(eom.getTime() / 1000)

      const txsUntil = transactions.filter(tx => {
        const d = (tx.date instanceof Date ? tx.date : new Date(tx.date)).toISOString().slice(0, 10)
        return d <= eomStr
      })

      const positions = calcPositions(txsUntil as any)
      let value = 0
      positions.forEach(pos => {
        if (pos.quantity <= 0) return
        const hist = historyMap.get(pos.ticker) ?? []
        const price = priceAtDate(hist, eomTs) ?? pos.avgPrice
        value += pos.quantity * price
      })

      // Net flow = buys - sells during this specific month
      const bomStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const monthTxs = transactions.filter(tx => {
        const d = (tx.date instanceof Date ? tx.date : new Date(tx.date)).toISOString().slice(0, 10)
        return d >= bomStr && d <= eomStr
      })
      const netFlow = monthTxs.reduce((sum, tx) => {
        const total = Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees)
        return tx.type === 'BUY' ? sum + total : sum - total
      }, 0)

      portfolioValues.push({ key: monthKey(year, month), value: Math.round(value * 100) / 100, netFlow })
    }

    // Compute monthly return % for each month
    const monthlyReturns: {
      key: string; year: number; month: number;
      returnPct: number; cdiPct: number | null; ibovPct: number | null; ifixPct: number | null
    }[] = []

    for (let i = 0; i < portfolioValues.length; i++) {
      const cur = portfolioValues[i]
      const prev = i > 0 ? portfolioValues[i - 1] : null
      const { year, month } = months[i]

      const startValue = prev?.value ?? 0
      // Modified Dietz: return = (end - start - flow) / (start + flow * 0.5)
      const denom = startValue + cur.netFlow * 0.5
      const returnPct = denom > 0 ? ((cur.value - startValue - cur.netFlow) / denom) * 100 : 0

      const eomTs = Math.floor(endOfMonth(year, month).getTime() / 1000)
      const prevEomTs = i > 0
        ? Math.floor(endOfMonth(months[i - 1].year, months[i - 1].month).getTime() / 1000)
        : eomTs - 30 * 86400

      const cdiPct = cdiMap.get(cur.key) ?? null
      const ibovPct = indexMonthlyReturn(ibovHistory, eomTs, prevEomTs)
      const ifixPct = ifixMap.get(cur.key) ?? null

      monthlyReturns.push({
        key: cur.key,
        year,
        month,
        returnPct: Math.round(returnPct * 100) / 100,
        cdiPct: cdiPct !== null ? Math.round(cdiPct * 100) / 100 : null,
        ibovPct: ibovPct !== null ? Math.round(ibovPct * 100) / 100 : null,
        ifixPct: ifixPct !== null ? Math.round(ifixPct * 100) / 100 : null,
      })
    }

    // Accumulated returns for chart — start with M-1 base point at 0%
    const baseDate = new Date(firstDate)
    baseDate.setUTCMonth(baseDate.getUTCMonth() - 1)
    const baseLabel = `${String(baseDate.getUTCMonth() + 1).padStart(2, '0')}/${String(baseDate.getUTCFullYear()).slice(2)}`

    let accPortfolio = 0, accCdi = 0, accIbov = 0, accIfix = 0
    const chartSeries = [
      { label: baseLabel, portfolio: 0, cdi: 0, ibov: 0, ifix: 0 },
      ...monthlyReturns.map(mr => {
        accPortfolio = (1 + accPortfolio / 100) * (1 + mr.returnPct / 100) * 100 - 100
        if (mr.cdiPct !== null) accCdi = (1 + accCdi / 100) * (1 + mr.cdiPct / 100) * 100 - 100
        if (mr.ibovPct !== null) accIbov = (1 + accIbov / 100) * (1 + mr.ibovPct / 100) * 100 - 100
        if (mr.ifixPct !== null) accIfix = (1 + accIfix / 100) * (1 + mr.ifixPct / 100) * 100 - 100
        const [yyyy, mm] = mr.key.split('-')
        const label = `${mm}/${yyyy.slice(2)}`
        return {
          label,
          portfolio: Math.round(accPortfolio * 100) / 100,
          cdi: mr.cdiPct !== null ? Math.round(accCdi * 100) / 100 : null,
          ibov: mr.ibovPct !== null ? Math.round(accIbov * 100) / 100 : null,
          ifix: mr.ifixPct !== null ? Math.round(accIfix * 100) / 100 : null,
        }
      }),
    ]

    // Monthly table grouped by year
    const tableByYear = new Map<number, Record<string, number | null>>()
    for (const mr of monthlyReturns) {
      if (!tableByYear.has(mr.year)) tableByYear.set(mr.year, {})
      tableByYear.get(mr.year)![String(mr.month)] = mr.returnPct
    }
    const monthlyTable = Array.from(tableByYear.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => {
        const values = Array.from({ length: 12 }, (_, i) => months[String(i)] ?? null)
        const yearReturns = values.filter(v => v !== null) as number[]
        const yearTotal = yearReturns.reduce((acc, r) => (1 + acc / 100) * (1 + r / 100) * 100 - 100, 0)
        return { year, months: values, yearTotal: Math.round(yearTotal * 100) / 100 }
      })

    // Add accumulated column to table
    let running = 0
    const tableWithAcc = [...monthlyTable].reverse().map(row => {
      running = (1 + running / 100) * (1 + row.yearTotal / 100) * 100 - 100
      return { ...row, accumulated: Math.round(running * 100) / 100 }
    })
    tableWithAcc.reverse()

    // KPIs
    const totalReturnPct = chartSeries.length ? chartSeries[chartSeries.length - 1].portfolio : 0
    const totalCdiAcc = chartSeries.length ? (chartSeries[chartSeries.length - 1].cdi ?? 0) : 0

    const last12 = monthlyReturns.slice(-12)
    const last12ReturnPct = last12.reduce((acc, r) => (1 + acc / 100) * (1 + r.returnPct / 100) * 100 - 100, 0)
    const last12CdiPct = last12
      .filter(r => r.cdiPct !== null)
      .reduce((acc, r) => (1 + acc / 100) * (1 + (r.cdiPct as number) / 100) * 100 - 100, 0)

    const lastMonth = monthlyReturns[monthlyReturns.length - 1]

    return {
      kpis: {
        totalReturnPct: Math.round(totalReturnPct * 100) / 100,
        last12mReturnPct: Math.round(last12ReturnPct * 100) / 100,
        lastMonthReturnPct: lastMonth?.returnPct ?? 0,
        totalVsCdi: Math.round((totalReturnPct - totalCdiAcc) * 100) / 100,
        last12mVsCdi: Math.round((last12ReturnPct - last12CdiPct) * 100) / 100,
        lastMonthVsCdi: lastMonth ? Math.round((lastMonth.returnPct - (lastMonth.cdiPct ?? 0)) * 100) / 100 : 0,
      },
      monthlyTable: tableWithAcc,
      chartSeries,
    }
  })
}
