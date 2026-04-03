import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import * as bcrypt from 'bcryptjs'

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const walletSchema = z.object({
  name: z.string().min(1),
})

export async function walletsRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body)
    const exists = await prisma.user.findUnique({ where: { email: body.email } })
    if (exists) return reply.code(409).send({ error: 'Email já cadastrado' })

    const passwordHash = await bcrypt.hash(body.password, 10)
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash },
    })

    const wallet = await prisma.wallet.create({
      data: { userId: user.id, name: 'Minha Carteira' },
    })

    return reply.code(201).send({ userId: user.id, walletId: wallet.id, name: user.name })
  })

  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { wallets: { orderBy: { createdAt: 'asc' }, take: 1 } },
    })

    if (!user) return reply.code(401).send({ error: 'Credenciais inválidas' })

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Credenciais inválidas' })

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      walletId: user.wallets[0]?.id ?? null,
    }
  })

  app.get('/users/:userId/wallets', async (req) => {
    const { userId } = req.params as { userId: string }
    return prisma.wallet.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  })

  app.post('/users/:userId/wallets', async (req, reply) => {
    const { userId } = req.params as { userId: string }
    const body = walletSchema.parse(req.body)
    const wallet = await prisma.wallet.create({ data: { userId, name: body.name } })
    return reply.code(201).send(wallet)
  })
}
