import Fastify from 'fastify'
import cors from '@fastify/cors'
import cron from 'node-cron'
import { assetsRoutes } from './routes/assets'
import { transactionsRoutes } from './routes/transactions'
import { dividendsRoutes } from './routes/dividends'
import { dashboardRoutes } from './routes/dashboard'
import { walletsRoutes } from './routes/wallets'
import { quotesRoutes } from './routes/quotes'
import { performanceRoutes } from './routes/performance'
import { ceilingPriceProjectionRoutes } from './routes/ceilingPriceProjection'
import { marketRoutes } from './routes/market'
import { projectionRoutes } from './routes/projection'
import { valuationRoutes } from './routes/valuation'
import { syncAllWallets } from './services/syncDividends'

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
  await app.register(performanceRoutes)
  await app.register(ceilingPriceProjectionRoutes)
  await app.register(marketRoutes)
  await app.register(projectionRoutes)
  await app.register(valuationRoutes)

  app.get('/health', async () => ({ status: 'ok' }))

  // Cron: sincroniza proventos de todas as carteiras todo dia às 06:00
  cron.schedule('0 6 * * *', async () => {
    console.log('[cron] Iniciando sincronização de proventos...')
    try {
      const result = await syncAllWallets()
      console.log(`[cron] Sync concluído — ${result.wallets} carteira(s), ${result.inserted} provento(s) inserido(s)`)
    } catch (err) {
      console.error('[cron] Erro na sincronização de proventos:', err)
    }
  }, { timezone: 'America/Sao_Paulo' })

  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`🚀 Backend rodando em http://localhost:${port}`)
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
