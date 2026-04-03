import { Transaction, TransactionType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

export interface Position {
  assetId: string
  ticker: string
  assetClass: string
  subtype: string | null
  quantity: number
  avgPrice: number
  totalInvested: number
  realizedGain: number
}

export function calcPositions(transactions: (Transaction & { asset: { ticker: string; assetClass: string; subtype: string | null } })[]): Map<string, Position> {
  const positions = new Map<string, Position>()

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  for (const tx of sorted) {
    const key = tx.assetId
    const qty = Number(tx.quantity)
    const price = Number(tx.unitPrice)
    const fees = Number(tx.fees)

    if (!positions.has(key)) {
      positions.set(key, {
        assetId: tx.assetId,
        ticker: tx.asset.ticker,
        assetClass: tx.asset.assetClass,
        subtype: tx.asset.subtype,
        quantity: 0,
        avgPrice: 0,
        totalInvested: 0,
        realizedGain: 0,
      })
    }

    const pos = positions.get(key)!

    if (tx.type === TransactionType.BUY) {
      const newTotalCost = pos.totalInvested + qty * price + fees
      const newQty = pos.quantity + qty
      pos.avgPrice = newQty > 0 ? newTotalCost / newQty : 0
      pos.quantity = newQty
      pos.totalInvested = newTotalCost
    } else {
      const gain = qty * (price - pos.avgPrice) - fees
      pos.realizedGain += gain
      pos.quantity -= qty
      if (pos.quantity <= 0) {
        pos.quantity = 0
        pos.avgPrice = 0
        pos.totalInvested = 0
      } else {
        pos.totalInvested = pos.quantity * pos.avgPrice
      }
    }
  }

  return positions
}

export function calcMonthlyEvolution(
  transactions: (Transaction & { asset: { assetClass: string } })[],
  months: number = 12
): { month: string; invested: number; gain: number }[] {
  const result: { month: string; invested: number; gain: number }[] = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    const endDateStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

    const txsUntilMonth = transactions.filter(tx => {
      const txDateStr = (typeof tx.date === 'string' ? tx.date : (tx.date as Date).toISOString()).slice(0, 10)
      return txDateStr <= endDateStr
    })
    const positions = calcPositions(txsUntilMonth as any)

    let invested = 0
    positions.forEach(pos => { invested += pos.totalInvested })

    result.push({ month: label, invested: Math.round(invested * 100) / 100, gain: 0 })
  }

  return result
}

export function calcAssetClassBreakdown(positions: Map<string, Position>, currentPrices: Map<string, number>) {
  const breakdown: Record<string, number> = {
    FII: 0, STOCK: 0, FIXED_INCOME: 0, TREASURY: 0, CRYPTO: 0,
  }

  positions.forEach((pos) => {
    if (pos.quantity <= 0) return
    const price = currentPrices.get(pos.ticker) ?? pos.avgPrice
    const value = pos.quantity * price
    breakdown[pos.assetClass] = (breakdown[pos.assetClass] ?? 0) + value
  })

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([cls, value]) => ({
      assetClass: cls,
      value: Math.round(value * 100) / 100,
      percentage: total > 0 ? Math.round((value / total) * 10000) / 100 : 0,
    }))
}
