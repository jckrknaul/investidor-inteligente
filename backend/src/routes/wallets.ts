import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import * as bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const googleSchema = z.object({
  credential: z.string().min(1),
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

    if (!user.passwordHash) return reply.code(401).send({ error: 'Use o login com Google para esta conta' })

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Credenciais inválidas' })

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      walletId: user.wallets[0]?.id ?? null,
    }
  })

  app.post('/auth/google', async (req, reply) => {
    const { credential } = googleSchema.parse(req.body)
    const clientId = process.env.GOOGLE_CLIENT_ID

    if (!clientId) return reply.code(500).send({ error: 'Google Client ID não configurado' })

    const client = new OAuth2Client(clientId)

    let payload
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
      payload = ticket.getPayload()
    } catch {
      return reply.code(401).send({ error: 'Token Google inválido' })
    }

    if (!payload?.email) return reply.code(401).send({ error: 'Email não disponível no token Google' })

    // Busca usuário existente pelo email
    let user = await prisma.user.findUnique({
      where: { email: payload.email },
      include: { wallets: { orderBy: { createdAt: 'asc' }, take: 1 } },
    })

    if (user) {
      // Atualiza provider e avatar se ainda não definidos
      if (!user.provider) {
        await prisma.user.update({
          where: { id: user.id },
          data: { provider: 'google', avatarUrl: payload.picture ?? null },
        })
      }
    } else {
      // Cria novo usuário via Google
      user = await prisma.user.create({
        data: {
          name: payload.name ?? payload.email.split('@')[0],
          email: payload.email,
          provider: 'google',
          avatarUrl: payload.picture ?? null,
        },
        include: { wallets: { orderBy: { createdAt: 'asc' }, take: 1 } },
      }) as any

      // Cria carteira padrão
      const wallet = await prisma.wallet.create({
        data: { userId: user!.id, name: 'Minha Carteira' },
      })

      return {
        userId: user!.id,
        name: user!.name,
        email: user!.email,
        avatarUrl: (user as any).avatarUrl,
        walletId: wallet.id,
      }
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: (user as any).avatarUrl,
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

  app.put('/wallets/:walletId', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    const body = walletSchema.parse(req.body)
    const wallet = await prisma.wallet.update({ where: { id: walletId }, data: { name: body.name } })
    return reply.send(wallet)
  })

  app.delete('/wallets/:walletId', async (req, reply) => {
    const { walletId } = req.params as { walletId: string }
    // Prevent deleting last wallet
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
    if (!wallet) return reply.code(404).send({ error: 'Carteira não encontrada' })
    const count = await prisma.wallet.count({ where: { userId: wallet.userId } })
    if (count <= 1) return reply.code(400).send({ error: 'Não é possível excluir a última carteira' })
    await prisma.wallet.delete({ where: { id: walletId } })
    return reply.code(204).send()
  })
}
