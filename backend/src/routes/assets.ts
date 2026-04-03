import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const assetSchema = z.object({
  ticker: z.string().min(1).toUpperCase(),
  name: z.string().optional(),
  assetClass: z.enum(['FII', 'STOCK', 'FIXED_INCOME', 'TREASURY', 'CRYPTO']),
  subtype: z.string().optional(),
  sector: z.string().optional(),
})

export async function assetsRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/assets', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const assets = await prisma.asset.findMany({
      where: { walletId },
      orderBy: { ticker: 'asc' },
    })
    return assets
  })

  app.post('/wallets/:walletId/assets', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const body = assetSchema.parse(req.body)

    const asset = await prisma.asset.upsert({
      where: { walletId_ticker: { walletId, ticker: body.ticker } },
      create: { walletId, ...body, name: body.name ?? body.ticker },
      update: { name: body.name, assetClass: body.assetClass, subtype: body.subtype, sector: body.sector },
    })
    return reply.code(201).send(asset)
  })

  app.delete('/assets/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.asset.delete({ where: { id } })
    return reply.code(204).send()
  })
}
