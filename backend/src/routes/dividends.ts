import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { fetchDividends } from '../services/quotes'

const dividendSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  assetClass: z.enum(['FII', 'STOCK', 'FIXED_INCOME', 'TREASURY', 'CRYPTO']),
  type: z.enum(['DIVIDEND', 'JCP', 'INCOME', 'AMORTIZATION', 'SUBSCRIPTION']),
  exDate: z.string(),
  payDate: z.string(),
  valuePerUnit: z.number().positive(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
})

export async function dividendsRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/dividends', async (req) => {
    const { walletId } = req.params as { walletId: string }
    const { year } = req.query as { year?: string }

    const where: any = { walletId }
    if (year) {
      where.payDate = {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      }
    }

    const dividends = await prisma.dividend.findMany({
      where,
      include: { asset: true },
      orderBy: { payDate: 'desc' },
    })
    return dividends
  })

  app.post('/wallets/:walletId/dividends', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const body = dividendSchema.parse(req.body)

    const asset = await prisma.asset.upsert({
      where: { walletId_ticker: { walletId, ticker: body.ticker } },
      create: {
        walletId,
        ticker: body.ticker,
        name: body.ticker,
        assetClass: body.assetClass,
      },
      update: {},
    })

    const totalValue = body.valuePerUnit * body.quantity

    const dividend = await prisma.dividend.create({
      data: {
        walletId,
        assetId: asset.id,
        type: body.type,
        exDate: new Date(body.exDate),
        payDate: new Date(body.payDate),
        valuePerUnit: body.valuePerUnit,
        quantity: body.quantity,
        totalValue,
        notes: body.notes,
      },
      include: { asset: true },
    })

    return reply.code(201).send(dividend)
  })

  app.delete('/dividends/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.dividend.delete({ where: { id } })
    return reply.code(204).send()
  })

  // Sincronização automática de proventos
  app.post('/wallets/:walletId/dividends/sync', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }

    // Busca todos os ativos da carteira com suas transações
    const assets = await prisma.asset.findMany({
      where: { walletId },
      include: {
        transactions: { orderBy: { date: 'asc' } },
      },
    })

    if (assets.length === 0) {
      return reply.code(200).send({ inserted: 0, tickers: [] })
    }

    let inserted = 0
    const processed: string[] = []

    await Promise.all(assets.map(async (asset) => {
      if (asset.transactions.length === 0) return

      // Data da primeira compra = ponto de partida para buscar proventos
      const firstBuy = asset.transactions.find(tx => tx.type === 'BUY')
      if (!firstBuy) return

      const since = firstBuy.date

      // Busca proventos na API
      const events = await fetchDividends(asset.ticker, since, asset.assetClass)
      if (events.length === 0) return

      for (const ev of events) {
        // Calcula posição na data ex (quantidade de cotas na data COM)
        const qty = asset.transactions
          .filter(tx => tx.date <= ev.exDate)
          .reduce((sum, tx) => {
            const q = Number(tx.quantity)
            return tx.type === 'BUY' ? sum + q : sum - q
          }, 0)

        if (qty <= 0) continue

        const totalValue = ev.valuePerUnit * qty

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
              totalValue,
              notes: 'sync:auto',
            },
          })
          inserted++
        } catch (e: any) {
          // Ignora violação de unique (provento já existe)
          if (!e?.code || e.code !== 'P2002') throw e
        }
      }

      processed.push(asset.ticker)
    }))

    return reply.code(200).send({ inserted, tickers: processed })
  })
}
