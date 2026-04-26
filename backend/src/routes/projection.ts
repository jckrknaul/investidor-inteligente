import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const numberRecord = z.record(z.string(), z.number())

const projectionSchema = z.object({
  patrimonio: z.string(),
  anos: z.number().int().min(1).max(100),
  defaultAporte: z.string(),
  defaultRent: z.string(),
  aporteOverrides: numberRecord.default({}),
  rentOverrides: numberRecord.default({}),
})

export async function projectionRoutes(app: FastifyInstance) {
  app.get('/wallets/:walletId/projection', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const projection = await prisma.projection.findUnique({ where: { walletId } })
    if (!projection) return reply.code(404).send({ error: 'Projeção não encontrada' })
    return projection
  })

  app.put('/wallets/:walletId/projection', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const body = projectionSchema.parse(req.body)

    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
    if (!wallet) return reply.code(404).send({ error: 'Carteira não encontrada' })

    const projection = await prisma.projection.upsert({
      where: { walletId },
      create: { walletId, ...body },
      update: body,
    })
    return reply.send(projection)
  })

  app.delete('/wallets/:walletId/projection', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    await prisma.projection.deleteMany({ where: { walletId } })
    return reply.code(204).send()
  })
}
