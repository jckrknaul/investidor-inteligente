import Fastify from 'fastify'
import cors from '@fastify/cors'
import { assetsRoutes } from './routes/assets'
import { transactionsRoutes } from './routes/transactions'
import { dividendsRoutes } from './routes/dividends'
import { dashboardRoutes } from './routes/dashboard'
import { walletsRoutes } from './routes/wallets'
import { quotesRoutes } from './routes/quotes'

const app = Fastify({ logger: true })

const start = async () => {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  await app.register(walletsRoutes)
  await app.register(assetsRoutes)
  await app.register(transactionsRoutes)
  await app.register(dividendsRoutes)
  await app.register(dashboardRoutes)
  await app.register(quotesRoutes)

  app.get('/health', async () => ({ status: 'ok' }))

  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`🚀 Backend rodando em http://localhost:${port}`)
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
