import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { calcPositions, calcAssetClassBreakdown } from '../services/portfolio'
import { fetchQuotes, fetchMonthlyHistory, priceAtOrBefore } from '../services/quotes'

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

    const positions = calcPositions(transactions as any)

    const activeTickers = Array.from(positions.values())
      .filter(p => p.quantity > 0)
      .map(p => p.ticker)

    // All tickers ever held (for historical evolution valuation)
    const allTickers = [...new Set((transactions as any[]).map((tx: any) => tx.asset.ticker))]

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

    const [currentPrices, histories] = await Promise.all([
      fetchQuotes(activeTickers),
      Promise.all(allTickers.map(async t => ({ ticker: t, data: await fetchMonthlyHistory(t, evolutionFrom) }))),
    ])

    const historyMap = new Map(histories.map(h => [h.ticker, h.data]))

    let totalInvested = 0
    let totalCurrentValue = 0

    const assets = Array.from(positions.values())
      .filter(pos => pos.quantity > 0)
      .map(pos => {
        const currentPrice = currentPrices.get(pos.ticker) ?? pos.avgPrice
        const currentValue = pos.quantity * currentPrice
        const investedValue = pos.quantity * pos.avgPrice
        const variation = pos.avgPrice > 0 ? ((currentPrice - pos.avgPrice) / pos.avgPrice) * 100 : 0
        const gain = currentValue - investedValue

        totalInvested += investedValue
        totalCurrentValue += currentValue

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
        }
      })
      .sort((a, b) => b.currentValue - a.currentValue)

    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const proventos12M = dividends
      .filter(d => new Date(d.payDate) >= twelveMonthsAgo)
      .reduce((sum, d) => sum + Number(d.totalValue), 0)

    const totalGain = totalCurrentValue - totalInvested
    const rentabilidade = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0
    const variacao = totalCurrentValue - totalInvested

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
        invested += p.totalInvested
        const history = historyMap.get(p.ticker) ?? []
        const price = priceAtOrBefore(history, endTs) ?? p.avgPrice
        currentValue += p.quantity * price
      })

      const gain = Math.round((currentValue - invested) * 100) / 100
      return { month: label, invested: Math.round(invested * 100) / 100, gain: Math.max(gain, 0) }
    })

    const breakdown = calcAssetClassBreakdown(positions, currentPrices)

    const groupedAssets: Record<string, typeof assets> = {}
    for (const asset of assets) {
      if (!groupedAssets[asset.assetClass]) groupedAssets[asset.assetClass] = []
      groupedAssets[asset.assetClass].push(asset)
    }

    return {
      kpis: {
        totalPatrimonio: Math.round(totalCurrentValue * 100) / 100,
        totalInvestido: Math.round(totalInvested * 100) / 100,
        lucroTotal: Math.round(totalGain * 100) / 100,
        proventos12M: Math.round(proventos12M * 100) / 100,
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
