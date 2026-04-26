import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { calcPositions } from '../services/portfolio'
import { fetchQuotes, fetchMonthlyHistory, priceAtOrBefore, fetchDividendYields, fetchTreasuryPrices } from '../services/quotes'
import { fetchCurrentCdiAnnual, fetchCurrentIpcaAnnual, fetchCdiDaily, fetchIpcaMonthly, projectFixedIncomeValue } from '../services/rates'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/dashboard', async (req) => {
    const { walletId } = req.params as { walletId: string }
    const { period = '12m' } = req.query as { period?: string }

    const [transactions, dividends] = await Promise.all([
      prisma.transaction.findMany({
        where: { walletId },
        include: { asset: true },
        orderBy: { date: 'asc' },
      }),
      prisma.dividend.findMany({
        where: { walletId },
        include: { asset: true },
      }),
    ])

    // calcPositions agrupa por assetId — para Renda Fixa cada lançamento deve ser
    // tratado como uma posição independente, então removemos as posições agrupadas
    // e injetamos uma posição "virtual" por transação de Renda Fixa.
    // Ativos com quantity <= 0 (vendidos) são ignorados.
    const positions = calcPositions(transactions as any)
    const soldFixedIncomeAssets = new Set<string>()
    Array.from(positions.entries()).forEach(([key, p]) => {
      if (p.assetClass === 'FIXED_INCOME') {
        if (p.quantity <= 0) soldFixedIncomeAssets.add(p.assetId)
        positions.delete(key)
      }
    })
    for (const tx of transactions as any[]) {
      if (tx.asset.assetClass !== 'FIXED_INCOME') continue
      if (tx.type !== 'BUY') continue
      // Pular ativos que foram totalmente vendidos
      if (soldFixedIncomeAssets.has(tx.assetId)) continue
      const principal = Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees)
      positions.set(tx.id, {
        assetId: tx.id, // usa o txId para identificar unicamente cada lançamento
        ticker: tx.asset.ticker,
        assetClass: 'FIXED_INCOME',
        subtype: tx.asset.subtype ?? null,
        quantity: 1,
        avgPrice: principal,
        totalInvested: principal,
        realizedGain: 0,
      } as any)
    }

    const activeTickers = Array.from(positions.values())
      .filter(p => p.quantity > 0 && p.assetClass !== 'FIXED_INCOME' && p.assetClass !== 'TREASURY')
      .map(p => p.ticker)

    const treasuryTickers = Array.from(positions.values())
      .filter(p => p.quantity > 0 && p.assetClass === 'TREASURY')
      .map(p => p.ticker)

    // All tickers ever held (for historical evolution valuation), excluding renda fixa
    const allTickers = [...new Set(
      (transactions as any[])
        .filter((tx: any) => tx.asset.assetClass !== 'FIXED_INCOME')
        .map((tx: any) => tx.asset.ticker)
    )]

    // Mapa txId → metadados de Renda Fixa (cada lançamento é único)
    const fixedIncomeMap = new Map<string, { purchaseDate: Date; indexer: string | null; rate: number | null; principal: number; tx: any }>()
    for (const tx of transactions as any[]) {
      if (tx.asset.assetClass !== 'FIXED_INCOME' || tx.type !== 'BUY') continue
      fixedIncomeMap.set(tx.id, {
        purchaseDate: new Date(tx.date),
        indexer: tx.asset.indexer ?? null,
        rate: tx.asset.rate !== null && tx.asset.rate !== undefined ? Number(tx.asset.rate) : null,
        principal: Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees),
        tx,
      })
    }

    // Compute the start date for the evolution chart based on selected period
    const now = new Date()
    let evolutionFrom: Date
    if (period === 'all') {
      evolutionFrom = transactions.length > 0
        ? new Date(transactions[0].date)
        : new Date(now.getFullYear(), now.getMonth() - 11, 1)
      evolutionFrom = new Date(Date.UTC(evolutionFrom.getUTCFullYear(), evolutionFrom.getUTCMonth(), 1))
    } else if (period === 'ytd') {
      evolutionFrom = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    } else if (period === '24m') {
      evolutionFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1))
    } else if (period === '60m') {
      evolutionFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 59, 1))
    } else { // '12m'
      evolutionFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    }

    // Data mais antiga de compra de Renda Fixa para buscar séries do BCB
    let earliestFixedIncomeDate: Date | null = null
    fixedIncomeMap.forEach(fi => {
      if (!earliestFixedIncomeDate || fi.purchaseDate < earliestFixedIncomeDate) {
        earliestFixedIncomeDate = fi.purchaseDate
      }
    })

    const [currentPrices, histories, cdiAnnual, ipcaAnnual, cdiDaily, ipcaMonthly, marketDY, treasuryPrices] = await Promise.all([
      fetchQuotes(activeTickers),
      Promise.all(allTickers.map(async t => ({ ticker: t, data: await fetchMonthlyHistory(t, evolutionFrom) }))),
      fetchCurrentCdiAnnual(),
      fetchCurrentIpcaAnnual(),
      earliestFixedIncomeDate ? fetchCdiDaily(earliestFixedIncomeDate, new Date()) : Promise.resolve([]),
      earliestFixedIncomeDate ? fetchIpcaMonthly(earliestFixedIncomeDate, new Date()) : Promise.resolve([]),
      fetchDividendYields(activeTickers),
      fetchTreasuryPrices(treasuryTickers),
    ])

    const historyMap = new Map(histories.map(h => [h.ticker, h.data]))

    // Excluir proventos sem data de pagamento distinta (payDate === exDate)
    const paidDividends = dividends.filter(d =>
      d.payDate.toISOString().slice(0, 10) !== d.exDate.toISOString().slice(0, 10)
    )
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const receivedDividends = paidDividends.filter(d => new Date(d.payDate) <= now)
    const recentDividends = receivedDividends.filter(d => new Date(d.payDate) >= twelveMonthsAgo)

    let totalInvested = 0
    let totalCurrentValue = 0

    const assets = Array.from(positions.values())
      .filter(pos => pos.quantity > 0)
      .map(pos => {
        let currentPrice: number
        if (pos.assetClass === 'FIXED_INCOME') {
          const fi = fixedIncomeMap.get(pos.assetId)
          if (fi) {
            const projected = projectFixedIncomeValue({
              principal: fi.principal,
              purchaseDate: fi.purchaseDate,
              indexer: fi.indexer,
              rate: fi.rate,
              cdiAnnual,
              ipcaAnnual,
              cdiDaily,
              ipcaMonthly,
            })
            currentPrice = pos.quantity > 0 ? projected / pos.quantity : pos.avgPrice
          } else {
            currentPrice = pos.avgPrice
          }
        } else if (pos.assetClass === 'TREASURY') {
          currentPrice = treasuryPrices.get(pos.ticker) ?? pos.avgPrice
        } else {
          currentPrice = currentPrices.get(pos.ticker) ?? pos.avgPrice
        }
        const currentValue = pos.quantity * currentPrice
        const investedValue = pos.quantity * pos.avgPrice
        const variation = pos.avgPrice > 0 ? ((currentPrice - pos.avgPrice) / pos.avgPrice) * 100 : 0
        const gain = currentValue - investedValue

        totalInvested += investedValue
        totalCurrentValue += currentValue

        const fi = pos.assetClass === 'FIXED_INCOME' ? fixedIncomeMap.get(pos.assetId) : undefined
        const fiAsset = fi?.tx?.asset

        return {
          assetId: pos.assetId,
          ticker: pos.ticker,
          assetClass: pos.assetClass,
          subtype: pos.subtype,
          quantity: pos.quantity,
          avgPrice: Math.round(pos.avgPrice * 100) / 100,
          currentPrice: Math.round(currentPrice * 100) / 100,
          currentValue: Math.round(currentValue * 100) / 100,
          investedValue: Math.round(investedValue * 100) / 100,
          variation: Math.round(variation * 100) / 100,
          gain: Math.round(gain * 100) / 100,
          // DY = dividend yield de mercado (BRAPI); YoC = (DY/100 * preço atual) / preço médio
          dy: (['STOCK', 'FII'].includes(pos.assetClass))
            ? Math.round((marketDY.get(pos.ticker) ?? 0) * 100) / 100
            : null,
          yoc: (['STOCK', 'FII'].includes(pos.assetClass) && pos.avgPrice > 0 && currentPrice > 0)
            ? Math.round(((marketDY.get(pos.ticker) ?? 0) / 100 * currentPrice / pos.avgPrice) * 10000) / 100
            : null,
          // Renda Fixa
          realAssetId: fiAsset?.id ?? null,
          txId: pos.assetClass === 'FIXED_INCOME' ? pos.assetId : null,
          issuer: fiAsset?.issuer ?? null,
          indexer: fi?.indexer ?? null,
          rate: fi?.rate ?? null,
          fixedForm: fiAsset?.fixedForm ?? null,
          dailyLiquidity: fiAsset?.dailyLiquidity ?? null,
          maturityDate: fiAsset?.maturityDate ?? null,
          purchaseDate: fi?.purchaseDate ?? null,
        }
      })
      .sort((a, b) => b.currentValue - a.currentValue)

    const proventos12M = recentDividends.reduce((sum, d) => sum + Number(d.totalValue), 0)
    const proventosTotal = receivedDividends.reduce((sum, d) => sum + Number(d.totalValue), 0)

    const totalGain = totalCurrentValue - totalInvested
    const variacao = totalCurrentValue - totalInvested

    // Rentabilidade Ponderada (Modified Dietz)
    // R = (V_final - V_inicial - Σfluxos) / (V_inicial + Σ(fluxo_i × peso_i))
    // V_final inclui dividendos recebidos; fluxos são apenas transações (compras/vendas)
    // peso_i = (total_dias - dias_do_fluxo) / total_dias
    const firstTxDate = transactions.length > 0
      ? new Date((typeof transactions[0].date === 'string' ? transactions[0].date : (transactions[0].date as Date).toISOString()).slice(0, 10))
      : now
    const totalDays = Math.max(1, (now.getTime() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24))

    let sumFlows = 0
    let weightedFlows = 0
    for (const tx of transactions as any[]) {
      const txDate = new Date((typeof tx.date === 'string' ? tx.date : (tx.date as Date).toISOString()).slice(0, 10))
      const daysFromStart = (txDate.getTime() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24)
      const weight = (totalDays - daysFromStart) / totalDays
      const amount = Number(tx.quantity) * Number(tx.unitPrice) + Number(tx.fees)
      const flow = tx.type === 'BUY' ? amount : -amount
      sumFlows += flow
      weightedFlows += flow * weight
    }

    const finalValue = totalCurrentValue + proventosTotal
    const rentabilidade = weightedFlows > 0
      ? ((finalValue - sumFlows) / weightedFlows) * 100
      : 0

    // Build list of months from evolutionFrom to now
    const evolutionMonths: { year: number; month: number }[] = []
    {
      let y = evolutionFrom.getUTCFullYear()
      let m = evolutionFrom.getUTCMonth()
      while (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth())) {
        evolutionMonths.push({ year: y, month: m })
        m++
        if (m > 11) { m = 0; y++ }
      }
    }

    const evolution = evolutionMonths.map(({ year, month }) => {
      const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))
      const endDateStr = lastDay.toISOString().slice(0, 10)
      const endTs = Math.floor(lastDay.getTime() / 1000)
      const label = new Date(Date.UTC(year, month, 1))
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })

      const txsUntil = (transactions as any[]).filter(tx => {
        const d = (typeof tx.date === 'string' ? tx.date : (tx.date as Date).toISOString()).slice(0, 10)
        return d <= endDateStr
      })

      const pos = calcPositions(txsUntil)
      let invested = 0
      let currentValue = 0

      pos.forEach(p => {
        if (p.quantity <= 0) return
        if (p.assetClass === 'FIXED_INCOME') return // tratado abaixo por transação
        invested += p.totalInvested
        const history = historyMap.get(p.ticker) ?? []
        const price = priceAtOrBefore(history, endTs) ?? p.avgPrice
        currentValue += p.quantity * price
      })

      // Renda Fixa: cada lançamento é tratado individualmente
      for (const tx of txsUntil) {
        if (tx.asset.assetClass !== 'FIXED_INCOME' || tx.type !== 'BUY') continue
        const fi = fixedIncomeMap.get(tx.id)
        if (!fi) continue
        invested += fi.principal
        if (fi.purchaseDate <= lastDay) {
          currentValue += projectFixedIncomeValue({
            principal: fi.principal,
            purchaseDate: fi.purchaseDate,
            indexer: fi.indexer,
            rate: fi.rate,
            cdiAnnual,
            ipcaAnnual,
            cdiDaily,
            ipcaMonthly,
            asOf: lastDay,
          })
        } else {
          currentValue += fi.principal
        }
      }

      const gain = Math.round((currentValue - invested) * 100) / 100
      return { month: label, invested: Math.round(invested * 100) / 100, gain: Math.max(gain, 0) }
    })

    // Breakdown por classe — somando direto a partir dos `assets` calculados
    // (já contemplam Renda Fixa individualizada e demais classes)
    const breakdownMap: Record<string, number> = {}
    for (const a of assets) {
      breakdownMap[a.assetClass] = (breakdownMap[a.assetClass] ?? 0) + a.currentValue
    }
    const breakdownTotal = Object.values(breakdownMap).reduce((s, v) => s + v, 0)
    const breakdown = Object.entries(breakdownMap)
      .filter(([, v]) => v > 0)
      .map(([cls, value]) => ({
        assetClass: cls,
        value: Math.round(value * 100) / 100,
        percentage: breakdownTotal > 0 ? Math.round((value / breakdownTotal) * 10000) / 100 : 0,
      }))

    const groupedAssets: Record<string, typeof assets> = {}
    for (const asset of assets) {
      if (!groupedAssets[asset.assetClass]) groupedAssets[asset.assetClass] = []
      groupedAssets[asset.assetClass].push(asset)
    }

    return {
      kpis: {
        totalPatrimonio: Math.round(totalCurrentValue * 100) / 100,
        totalInvestido: Math.round(totalInvested * 100) / 100,
        lucroTotal: Math.round((totalGain + proventosTotal) * 100) / 100,
        ganhoCapital: Math.round(totalGain * 100) / 100,
        proventos12M: Math.round(proventos12M * 100) / 100,
        proventosTotal: Math.round(proventosTotal * 100) / 100,
        variacao: Math.round(variacao * 100) / 100,
        variacaoPct: Math.round((totalInvested > 0 ? (variacao / totalInvested) * 100 : 0) * 100) / 100,
        rentabilidade: Math.round(rentabilidade * 100) / 100,
      },
      evolution,
      breakdown,
      groupedAssets,
      totalAssets: assets.length,
    }
  })

  app.get('/wallets/:walletId/summary', async (req) => {
    const { walletId } = req.params as { walletId: string }

    const [txCount, divCount] = await Promise.all([
      prisma.transaction.count({ where: { walletId } }),
      prisma.dividend.count({ where: { walletId } }),
    ])

    return { transactions: txCount, dividends: divCount }
  })
}
