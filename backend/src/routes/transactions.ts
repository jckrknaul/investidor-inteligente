import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const txSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  assetClass: z.enum(['FII', 'STOCK', 'FIXED_INCOME', 'TREASURY', 'CRYPTO']),
  subtype: z.string().optional(),
  type: z.enum(['BUY', 'SELL']),
  date: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  fees: z.number().min(0).default(0),
  notes: z.string().optional(),
})

export async function transactionsRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/transactions', async (req) => {
    const { walletId } = req.params as { walletId: string }
    const { assetClass, ticker } = req.query as { assetClass?: string; ticker?: string }

    const transactions = await prisma.transaction.findMany({
      where: {
        walletId,
        ...(ticker ? { asset: { ticker } } : {}),
        ...(assetClass ? { asset: { assetClass: assetClass as any } } : {}),
      },
      include: { asset: true },
      orderBy: { date: 'desc' },
    })
    return transactions
  })

  app.post('/wallets/:walletId/transactions', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const body = txSchema.parse(req.body)

    const asset = await prisma.asset.upsert({
      where: { walletId_ticker: { walletId, ticker: body.ticker } },
      create: {
        walletId,
        ticker: body.ticker,
        name: body.ticker,
        assetClass: body.assetClass,
        subtype: body.subtype,
      },
      update: {},
    })

    const tx = await prisma.transaction.create({
      data: {
        walletId,
        assetId: asset.id,
        type: body.type,
        date: new Date(body.date),
        quantity: body.quantity,
        unitPrice: body.unitPrice,
        fees: body.fees,
        notes: body.notes,
      },
      include: { asset: true },
    })

    return reply.code(201).send(tx)
  })

  app.put('/transactions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const updateSchema = z.object({
      type: z.enum(['BUY', 'SELL']),
      date: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
      fees: z.number().min(0).default(0),
      notes: z.string().optional(),
    })
    const body = updateSchema.parse(req.body)

    const tx = await prisma.transaction.update({
      where: { id },
      data: {
        type: body.type,
        date: new Date(body.date),
        quantity: body.quantity,
        unitPrice: body.unitPrice,
        fees: body.fees,
        notes: body.notes,
      },
      include: { asset: true },
    })
    return tx
  })

  app.delete('/transactions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.transaction.delete({ where: { id } })
    return reply.code(204).send()
  })
}
