import { prisma } from '../lib/prisma'
import { fetchDividends } from './quotes'

export async function syncAllWallets(): Promise<{ wallets: number; inserted: number }> {
  const wallets = await prisma.wallet.findMany({ select: { id: true } })

  let totalInserted = 0

  for (const wallet of wallets) {
    const inserted = await syncWallet(wallet.id)
    totalInserted += inserted
  }

  return { wallets: wallets.length, inserted: totalInserted }
}

export async function syncWallet(walletId: string): Promise<number> {
  const assets = await prisma.asset.findMany({
    where: { walletId },
    include: { transactions: { orderBy: { date: 'asc' } } },
  })

  let inserted = 0

  for (const asset of assets) {
    const firstBuy = asset.transactions.find(tx => tx.type === 'BUY')
    if (!firstBuy) continue

    const events = await fetchDividends(asset.ticker, firstBuy.date, asset.assetClass)

    for (const ev of events) {
      const qty = asset.transactions
        .filter(tx => tx.date <= ev.exDate)
        .reduce((sum, tx) => {
          const q = Number(tx.quantity)
          return tx.type === 'BUY' ? sum + q : sum - q
        }, 0)

      if (qty <= 0) continue

      try {
        await prisma.dividend.create({
          data: {
            walletId,
            assetId: asset.id,
            type: ev.type,
            exDate: ev.exDate,
            payDate: ev.payDate,
            valuePerUnit: ev.valuePerUnit,
            quantity: qty,
            totalValue: ev.valuePerUnit * qty,
            notes: 'sync:auto',
          },
        })
        inserted++
      } catch (e: any) {
        if (!e?.code || e.code !== 'P2002') throw e
      }
    }
  }

  return inserted
}
