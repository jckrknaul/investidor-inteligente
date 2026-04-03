import { FastifyInstance } from 'fastify'
import { fetchQuotes, fetchQuoteForDate, searchTickers } from '../services/quotes'

export async function quotesRoutes(app: FastifyInstance) {
  app.get('/quotes/search', async (req, reply) => {
    const { q } = req.query as { q?: string }
    if (!q || q.length < 1) return []
    return searchTickers(q)
  })

  app.get('/quotes/:ticker', async (req, reply) => {
    const { ticker } = req.params as { ticker: string }
    const { date } = req.query as { date?: string }

    const price = date
      ? await fetchQuoteForDate(ticker.toUpperCase(), date)
      : (await fetchQuotes([ticker.toUpperCase()])).get(ticker.toUpperCase()) ?? null

    if (!price) {
      return reply.code(404).send({ error: 'Cotação não encontrada para este ticker' })
    }

    return { ticker: ticker.toUpperCase(), price, date: date ?? 'current' }
  })
}
