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
  // Renda Fixa
  issuer: z.string().optional(),
  indexer: z.string().optional(),
  rate: z.number().optional(),
  fixedForm: z.string().optional(),
  dailyLiquidity: z.boolean().optional(),
  maturityDate: z.string().optional(),
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

    const isFixedIncome = body.assetClass === 'FIXED_INCOME'
    const fixedFields = isFixedIncome
      ? {
          issuer: body.issuer ?? null,
          indexer: body.indexer ?? null,
          rate: body.rate ?? null,
          fixedForm: body.fixedForm ?? null,
          dailyLiquidity: body.dailyLiquidity ?? null,
          maturityDate: body.maturityDate ? new Date(body.maturityDate) : null,
        }
      : {}

    const asset = await prisma.asset.upsert({
      where: { walletId_ticker: { walletId, ticker: body.ticker } },
      create: {
        walletId,
        ticker: body.ticker,
        name: isFixedIncome && body.issuer ? `${body.issuer} ${body.subtype ?? ''}`.trim() : body.ticker,
        assetClass: body.assetClass,
        subtype: body.subtype,
        ...fixedFields,
      },
      update: {
        assetClass: body.assetClass,
        subtype: body.subtype ?? null,
        ...fixedFields,
      },
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

  // Exclui todos os lançamentos de um ativo (e o asset + dividendos relacionados)
  app.delete('/assets/:assetId/all-transactions', async (req, reply) => {
    const { assetId } = req.params as { assetId: string }
    await prisma.$transaction([
      prisma.dividend.deleteMany({ where: { assetId } }),
      prisma.transaction.deleteMany({ where: { assetId } }),
      prisma.asset.delete({ where: { id: assetId } }),
    ])
    return reply.code(204).send()
  })
}
