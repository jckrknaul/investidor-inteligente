import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { syncWallet } from '../services/syncDividends'

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

  app.post('/wallets/:walletId/dividends/sync', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const { reset } = req.query as { reset?: string }

    if (reset === 'true') {
      await prisma.dividend.deleteMany({ where: { walletId, notes: 'sync:auto' } })
    }

    const inserted = await syncWallet(walletId)
    return reply.code(200).send({ inserted })
  })
}
