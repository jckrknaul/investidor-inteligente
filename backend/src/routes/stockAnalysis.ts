import { FastifyInstance } from 'fastify'

const BRAPI = 'https://brapi.dev/api'
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pct = (v: number | null | undefined): number | null =>
  typeof v === 'number' && isFinite(v) ? Math.round(v * 10000) / 100 : null

const round2 = (v: number | null | undefined): number | null =>
  typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null

const round0 = (v: number | null | undefined): number | null =>
  typeof v === 'number' && isFinite(v) ? Math.round(v) : null

const round4 = (v: number | null | undefined): number | null =>
  typeof v === 'number' && isFinite(v) ? Math.round(v * 10000) / 10000 : null

// Extrai entradas anuais de um módulo histórico (objeto chave→{type,endDate,...})
function yearlyEntries(module: any): any[] {
  if (!module) return []
  return Object.values(module)
    .filter((x: any) => x?.type === 'yearly')
    .sort((a: any, b: any) => a.endDate < b.endDate ? -1 : 1)
}

// ─── Fetch completo do brapi (quote + módulos + histórico) ────────────────────
async function fetchBrapiAll(ticker: string, token: string) {
  // Plano Pro libera: financialData, financialDataHistory, cashflowHistory
  const MODULES = [
    'summaryProfile',
    'defaultKeyStatistics',
    'defaultKeyStatisticsHistory',
    'financialData',
    'financialDataHistory',
    'incomeStatementHistory',
    'balanceSheetHistory',
    'cashflowHistory',
  ].join(',')

  async function fetchHistory(range: string) {
    const res = await fetch(`${BRAPI}/quote/${ticker}?range=${range}&interval=1mo&token=${token}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json() as any
    if (data?.error) return null
    return data
  }
  async function fetchHistoryWithDiv(range: string) {
    const res = await fetch(`${BRAPI}/quote/${ticker}?range=${range}&interval=1mo&dividends=true&token=${token}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json() as any
    if (data?.error) return null
    return data
  }

  const [quoteModRes, quoteBasicRes] = await Promise.all([
    fetch(`${BRAPI}/quote/${ticker}?modules=${MODULES}&token=${token}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) }),
    fetch(`${BRAPI}/quote/${ticker}?token=${token}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) }),
  ])

  const [quoteModData, quoteBasicData] = await Promise.all([
    quoteModRes.ok ? quoteModRes.json() : null,
    quoteBasicRes.ok ? quoteBasicRes.json() : null,
  ]) as [any, any]

  // Histórico de preços: 10y para cobrir o filtro de 10 anos no gráfico de DY; fallback 5y → 1y
  const histData = (await fetchHistory('10y')) ?? (await fetchHistory('5y')) ?? (await fetchHistory('1y'))
  // Dividendos: range=max para garantir histórico completo; fallback para 5y → 1y
  const divData = (await fetchHistoryWithDiv('max')) ?? (await fetchHistoryWithDiv('5y')) ?? (await fetchHistoryWithDiv('1y'))

  // Se a resposta com módulos trouxer preço válido, usa ela; caso contrário merge com quote básica
  const quoteWithMods = quoteModData?.results?.[0]
  const quoteBasic = quoteBasicData?.results?.[0]
  const quote = (quoteWithMods?.regularMarketPrice != null)
    ? quoteWithMods
    : quoteBasic ? { ...quoteBasic, ...quoteWithMods } : null

  // Fallback: se summaryProfile veio vazio, tenta buscar com ticker ON (3) ou Unit (11)
  if (quote && (!quote.summaryProfile || Object.keys(quote.summaryProfile).filter(k => quote.summaryProfile[k] != null).length === 0)) {
    const base = ticker.replace(/\d+[A-Z]?$/i, '')
    const altTickers = [`${base}3`, `${base}11`, `${base}4`].filter(t => t.toUpperCase() !== ticker.toUpperCase())
    for (const alt of altTickers) {
      try {
        const res = await fetch(`${BRAPI}/quote/${alt}?modules=summaryProfile&token=${token}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue
        const data = await res.json() as any
        const sp = data?.results?.[0]?.summaryProfile
        if (sp && sp.longBusinessSummary) {
          quote.summaryProfile = sp
          break
        }
      } catch { /* next */ }
    }
  }

  return {
    quote,
    priceHistory: (histData?.results?.[0]?.historicalDataPrice ?? []) as { date: number; close: number; volume: number }[],
    dividendsRaw: (divData?.results?.[0]?.dividendsData?.cashDividends ?? []) as {
      paymentDate: string; rate: number; label: string; lastDatePrior: string
    }[],
  }
}

// ─── Detalhes da empresa via B3 ──────────────────────────────────────────────
interface B3Detail {
  market: string | null          // "BOVESPA NIVEL 1"
  dateQuotation: string | null   // "14/01/1972" (estreia na bolsa)
  otherCodes: string[]           // ["CMIG3","CMIG4"]
  cnpj: string | null
  tradingName: string | null
  industryClassification: string | null
}

const b3Cache = new Map<string, { data: B3Detail; fetchedAt: number }>()
const B3_TTL = 1000 * 60 * 60 * 12 // 12 horas

async function fetchB3Detail(ticker: string): Promise<B3Detail> {
  const baseTicker = ticker.replace(/\d+[A-Z]?$/i, '').toUpperCase()
  const cached = b3Cache.get(baseTicker)
  if (cached && Date.now() - cached.fetchedAt < B3_TTL) return cached.data

  const empty: B3Detail = { market: null, dateQuotation: null, otherCodes: [], cnpj: null, tradingName: null, industryClassification: null }

  try {
    // 1. Buscar empresa pelo ticker base
    const searchPayload = Buffer.from(JSON.stringify({
      language: 'pt-br', pageNumber: 1, pageSize: 10, company: baseTicker
    })).toString('base64')
    const searchRes = await fetch(
      `https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetInitialCompanies/${searchPayload}`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    )
    if (!searchRes.ok) return empty
    const searchData = await searchRes.json() as { results?: { codeCVM?: string; issuingCompany?: string }[] }
    const company = (searchData.results ?? []).find(c => c.issuingCompany === baseTicker)
    if (!company?.codeCVM) return empty

    // 2. Buscar detalhes com codeCVM
    const detailPayload = Buffer.from(JSON.stringify({
      codeCVM: company.codeCVM, language: 'pt-br'
    })).toString('base64')
    const detailRes = await fetch(
      `https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetDetail/${detailPayload}`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    )
    if (!detailRes.ok) return empty
    const d = await detailRes.json() as any

    const result: B3Detail = {
      market: d.market ?? null,
      dateQuotation: d.dateQuotation ?? null,
      otherCodes: (d.otherCodes ?? []).map((c: any) => c.code).filter(Boolean),
      cnpj: d.cnpj ?? null,
      tradingName: d.tradingName ?? null,
      industryClassification: d.industryClassification ?? null,
    }
    b3Cache.set(baseTicker, { data: result, fetchedAt: Date.now() })
    return result
  } catch { return empty }
}

// ─── Comunicados CVM (dados abertos) ─────────────────────────────────────────

// Cache do CSV de comunicados por ano
const csvCache = new Map<number, { data: string; fetchedAt: number }>()
const CSV_TTL = 1000 * 60 * 60 * 4 // 4 horas

async function getCvmCsv(year: number): Promise<string> {
  const cached = csvCache.get(year)
  if (cached && Date.now() - cached.fetchedAt < CSV_TTL) return cached.data

  const zipUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_${year}.zip`
  const res = await fetch(zipUrl, { headers: HEADERS, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`CVM zip ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())

  // Parse ZIP manually (single file): find local file header, skip to data
  // ZIP local file header: PK\x03\x04
  const lhOffset = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  if (lhOffset < 0) throw new Error('Invalid ZIP')
  const compMethod = buf.readUInt16LE(lhOffset + 8)
  const compSize = buf.readUInt32LE(lhOffset + 18)
  const fnLen = buf.readUInt16LE(lhOffset + 26)
  const extraLen = buf.readUInt16LE(lhOffset + 28)
  const dataOffset = lhOffset + 30 + fnLen + extraLen
  const compData = buf.subarray(dataOffset, dataOffset + compSize)

  let csv: string
  if (compMethod === 0) {
    csv = compData.toString('latin1')
  } else {
    // deflate (method 8) — use raw inflate
    const { inflateRawSync } = await import('zlib')
    csv = inflateRawSync(compData).toString('latin1')
  }

  csvCache.set(year, { data: csv, fetchedAt: Date.now() })
  return csv
}

// Mapa de ticker base → termos de busca no CSV da CVM
// O CSV usa Nome_Companhia, precisamos buscar pela empresa controladora
function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchComunicados(ticker: string, companyName?: string, cnpjFormatted?: string | null): Promise<{
  items: { date: string; category: string; description: string; url: string }[]
  fallbackUrl: string
}> {
  const fallbackUrl = `https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx?Ticker=${ticker}&Periodo=2`
  const items: { date: string; category: string; description: string; url: string }[] = []

  try {
    const year = new Date().getFullYear()
    const csv = await getCvmCsv(year)
    const lines = csv.split('\n')

    // CNPJ bruto (sem pontuação) para match direto no CSV
    const cnpjRaw = cnpjFormatted?.replace(/[.\-\/]/g, '') ?? null

    // Construir termos de busca a partir do nome da empresa (brapi)
    const baseTicker = ticker.replace(/\d+[A-Z]?$/i, '').toUpperCase()
    const searchTerms: string[] = []

    if (companyName) {
      const cleaned = normalizeStr(companyName)
        .replace(/\b(SA|S A|PREFERENCIAL|PFD|ON|PN|UNIT|UNT|ORDINARIA|CIA|COMPANHIA|NON|CUM|PERP|REGISTERED|SHS)\b/g, '')
        .trim()
      if (cleaned.length > 3) searchTerms.push(cleaned)
    }
    searchTerms.push(baseTicker)

    // Encontrar o CNPJ da empresa no CSV
    let targetCnpj = ''

    // Tentativa 1: match direto por CNPJ (mais confiável)
    if (cnpjRaw) {
      // Verifica se esse CNPJ existe no CSV
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line) continue
        const cols = line.split(';')
        if (cols.length < 13) continue
        const csvCnpj = (cols[0] ?? '').replace(/[.\-\/]/g, '')
        if (csvCnpj === cnpjRaw) {
          targetCnpj = cols[0] ?? ''
          break
        }
      }
    }

    // Tentativa 2: busca por nome (fallback)
    if (!targetCnpj) {
      const cnpjCounts = new Map<string, { count: number; name: string }>()

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line) continue
        const cols = line.split(';')
        if (cols.length < 13) continue
        const nome = normalizeStr(cols[1] ?? '')

        const matches = searchTerms.some(term => {
          const termWords = term.split(' ').filter(w => w.length > 2)
          if (termWords.length === 0) return false
          return termWords.every(w => {
            const prefix = w.slice(0, 4)
            return nome.includes(prefix)
          })
        })

        if (matches) {
          const cnpj = cols[0] ?? ''
          const entry = cnpjCounts.get(cnpj)
          if (entry) entry.count++
          else cnpjCounts.set(cnpj, { count: 1, name: cols[1] ?? '' })
        }
      }

      let maxCount = 0
      for (const [cnpj, { count, name }] of cnpjCounts) {
        const n = normalizeStr(name)
        const isSubsidiary = /DISTRIBUIC|GERAC|TRANSMISS|LIGHT SESA/.test(n)
        const weight = isSubsidiary ? count : count * 2
        if (weight > maxCount) { maxCount = weight; targetCnpj = cnpj }
      }
    }

    if (!targetCnpj) return { items, fallbackUrl }

    // Extrair comunicados desse CNPJ
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const cols = line.split(';')
      if (cols.length < 13) continue
      if (cols[0] !== targetCnpj) continue

      const dataRef = cols[3] ?? ''    // Data_Referencia
      const categoria = cols[4] ?? ''  // Categoria
      const tipo = cols[5] ?? ''       // Tipo
      const especie = cols[6] ?? ''    // Especie
      const assunto = cols[7] ?? ''    // Assunto
      const dataEntrega = cols[8] ?? '' // Data_Entrega
      const linkDownload = cols[12]?.trim() ?? '' // Link_Download

      const descParts = [tipo, especie, assunto].filter(Boolean)
      const description = descParts.join(' – ') || categoria

      // Formata data
      const d = dataEntrega || dataRef
      const date = d ? d.split('-').reverse().join('/') : '—'

      items.push({
        date,
        category: categoria,
        description,
        url: linkDownload || fallbackUrl,
      })
    }

    // Ordena por data de entrega (mais recente primeiro)
    items.sort((a, b) => {
      const da = a.date.split('/').reverse().join('')
      const db = b.date.split('/').reverse().join('')
      return db.localeCompare(da)
    })
  } catch { /* fallback vazio */ }

  return { items, fallbackUrl }
}

// ─── Rota ─────────────────────────────────────────────────────────────────────
export async function stockAnalysisRoutes(app: FastifyInstance) {
  // Histórico de preços diário/semanal por período (para o gráfico interativo)
  app.get('/stocks/:ticker/price-history', async (req, reply) => {
    const { ticker } = req.params as { ticker: string }
    const { period = '1y' } = req.query as { period?: string }
    const token = process.env.BRAPI_TOKEN ?? ''

    const PERIOD_MAP: Record<string, { range: string; interval: string }> = {
      '1d':  { range: '1d',  interval: '1d' },
      '7d':  { range: '5d',  interval: '1d' },
      '1mo': { range: '1mo', interval: '1d' },
      '6mo': { range: '6mo', interval: '1d' },
      'ytd': { range: 'ytd', interval: '1d' },
      '1y':  { range: '1y',  interval: '1d' },
      '5y':  { range: '5y',  interval: '1wk' },
    }
    const { range, interval } = PERIOD_MAP[period] ?? PERIOD_MAP['1y']

    const res = await fetch(
      `${BRAPI}/quote/${ticker.toUpperCase()}?range=${range}&interval=${interval}&token=${token}`,
      { headers: HEADERS, signal: AbortSignal.timeout(12000) }
    )
    if (!res.ok) return reply.code(502).send({ error: 'Erro ao buscar cotação' })
    const data = await res.json() as any
    if (data?.error) return reply.code(404).send({ error: 'Dados não encontrados' })

    const raw = (data?.results?.[0]?.historicalDataPrice ?? []) as { date: number; close: number; volume: number }[]
    const prices = raw
      .filter(p => p.close > 0)
      .sort((a, b) => a.date - b.date)
      .map(p => ({
        date: new Date(p.date * 1000).toISOString().slice(0, 10), // YYYY-MM-DD
        close: round2(p.close)!,
        volume: p.volume,
      }))

    return { ticker: ticker.toUpperCase(), period, interval, data: prices }
  })


  app.get('/stocks/:ticker/analysis', async (req, reply) => {
    const { ticker } = req.params as { ticker: string }
    const token = process.env.BRAPI_TOKEN ?? ''

    const { quote, priceHistory, dividendsRaw } = await fetchBrapiAll(ticker.toUpperCase(), token)

    if (!quote || !quote.regularMarketPrice) {
      return reply.code(404).send({ error: 'Ação não encontrada', ticker })
    }

    const r = quote

    // ─── Perfil ───────────────────────────────────────────────────────────────
    const sp = r.summaryProfile ?? {}
    // Pré-extrai módulos para usar no profile
    const ks0  = r.defaultKeyStatistics ?? {}
    const fd0  = r.financialData ?? {}
    const bsh0 = yearlyEntries(r.balanceSheetHistory)
    const lb0  = bsh0.slice(-1)[0] ?? {}

    // Dados da B3 (segmento de listagem, estreia, papéis)
    const b3 = await fetchB3Detail(ticker)

    // Cálculo de dívidas reutilizável
    const _grossDebt =
      (lb0.shortLongTermDebt ?? lb0.loansAndFinancing ?? 0)
      + (lb0.longTermDebt ?? lb0.longTermLoansAndFinancing ?? 0)
      + (lb0.debentures ?? 0) + (lb0.longTermDebentures ?? 0)
    const _cash = lb0.cash ?? lb0.cashAndCashEquivalents ?? fd0.totalCash ?? 0

    // CNPJ formatado (B3 > brapi)
    const rawCnpj: string | null = b3.cnpj ?? sp.cnpj ?? null
    const cnpjFmt = rawCnpj && rawCnpj.length === 14
      ? rawCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
      : rawCnpj

    // Ano de fundação
    const foundedYear: number | null = sp.startDate
      ? parseInt(sp.startDate.slice(0, 4)) || null
      : null

    // Ano de estreia na bolsa (B3 dateQuotation "14/01/1972")
    const ipoYear: number | null = b3.dateQuotation
      ? parseInt(b3.dateQuotation.split('/').pop() ?? '') || null
      : null

    // Segmento de listagem (B3 market "BOVESPA NIVEL 1" → "Nível 1")
    const listingSegment: string | null = b3.market
      ? b3.market
          .replace(/^BOVESPA\s*/i, '')
          .replace(/NIVEL/i, 'Nível')
          .replace(/NOVO MERCADO/i, 'Novo Mercado')
          .trim() || null
      : null

    // Liquidez média diária (volume * preço)
    const avgDailyLiquidity: number | null =
      r.regularMarketVolume && r.regularMarketPrice
        ? round0(r.regularMarketVolume * r.regularMarketPrice)
        : null

    const profile = {
      ticker: ticker.toUpperCase(),
      name: r.longName ?? r.shortName ?? ticker,
      cnpj: cnpjFmt,
      foundedYear,
      ipoYear,
      sector: sp.sector ?? null,
      industry: sp.industry ?? null,
      listingSegment,
      otherCodes: b3.otherCodes,
      description: sp.longBusinessSummary ?? null,
      website: sp.website ?? null,
      employees: sp.fullTimeEmployees ?? null,
      logoUrl: r.logourl ?? null,
      // Dados financeiros
      marketCap: round0(r.marketCap ?? ks0.marketCap),
      enterpriseValue: round0(ks0.enterpriseValue),
      shareholdersEquity: round0(lb0.totalStockholderEquity ?? lb0.shareholdersEquity),
      totalAssets: round0(lb0.totalAssets),
      totalCurrentAssets: round0(lb0.totalCurrentAssets),
      netDebt: _grossDebt > 0 ? round0(_grossDebt - _cash) : null,
      grossDebt: round0(_grossDebt),
      totalCash: round0(_cash),
      sharesOutstanding: round0(ks0.sharesOutstanding ?? r.sharesOutstanding),
      freeFloat: round2(ks0.floatShares && ks0.sharesOutstanding
        ? (ks0.floatShares / ks0.sharesOutstanding) * 100 : null),
      totalRevenue: round0(fd0.totalRevenue),
      ebitda: round0(fd0.ebitda),
      netIncome: round0(ks0.netIncomeToCommon),
      avgDailyLiquidity,
    }

    // ─── Cotação atual ────────────────────────────────────────────────────────
    const currentPrice = r.regularMarketPrice as number
    const quote_out = {
      price: round2(currentPrice)!,
      change: round2(r.regularMarketChange),
      changePct: round2(r.regularMarketChangePercent),
      volume: round0(r.regularMarketVolume),
      marketCap: round0(r.marketCap),
      fiftyTwoWeekHigh: round2(r.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: round2(r.fiftyTwoWeekLow),
      previousClose: round2(r.regularMarketPreviousClose),
    }

    // ─── Rentabilidade por período ────────────────────────────────────────────
    const sortedHistory = [...priceHistory].sort((a, b) => a.date - b.date)
    const findPriceNMonthsAgo = (months: number): number | null => {
      if (sortedHistory.length === 0) return null
      const target = Date.now() / 1000 - months * 30.44 * 86400
      let best = sortedHistory[0]
      let minDiff = Math.abs(sortedHistory[0].date - target)
      for (const p of sortedHistory) {
        const diff = Math.abs(p.date - target)
        if (diff < minDiff) { minDiff = diff; best = p }
      }
      return best.close
    }
    const calcRent = (months: number): number | null => {
      const past = findPriceNMonthsAgo(months)
      if (!past || past <= 0) return null
      return Math.round(((currentPrice / past) - 1) * 10000) / 100
    }
    const rentabilidade = {
      '1m': calcRent(1),
      '3m': calcRent(3),
      '6m': calcRent(6),
      '12m': calcRent(12),
      '24m': calcRent(24),
      '60m': calcRent(60),
    }

    // ─── Histórico de preços para o gráfico ───────────────────────────────────
    const priceHistoryOut = sortedHistory.map(p => ({
      date: new Date(p.date * 1000).toISOString().slice(0, 7), // YYYY-MM
      close: round2(p.close)!,
      volume: p.volume,
    }))

    // ─── Módulos fundamentalistas ─────────────────────────────────────────────
    const ks  = r.defaultKeyStatistics ?? {}
    const fd  = r.financialData ?? {}

    // Ações em circulação
    const sharesOut: number | null =
      ks.sharesOutstanding ?? r.sharesOutstanding ?? ks.impliedSharesOutstanding ?? null

    // Balanço mais recente (fallback quando financialData não traz tudo)
    const bsh = yearlyEntries(r.balanceSheetHistory)
    const latestBs = bsh.slice(-1)[0] ?? {}

    // Patrimônio líquido: Yahoo = totalStockholderEquity; brapi BR = shareholdersEquity
    const equity: number | null =
      latestBs.totalStockholderEquity ?? latestBs.shareholdersEquity ?? null

    // Dívida bruta: Yahoo = shortLongTermDebt+longTermDebt; brapi BR = loansAndFinancing + debentures
    const grossDebt: number =
      (latestBs.shortLongTermDebt ?? latestBs.loansAndFinancing ?? 0) +
      (latestBs.longTermDebt ?? latestBs.longTermLoansAndFinancing ?? 0) +
      (latestBs.debentures ?? 0) + (latestBs.longTermDebentures ?? 0)
    const cashBs: number = latestBs.cash ?? latestBs.cashAndCashEquivalents ?? 0
    const totalAssets: number | null = latestBs.totalAssets ?? null

    // DRE mais recente
    const inch = yearlyEntries(r.incomeStatementHistory)
    const latestInc = inch.slice(-1)[0] ?? {}
    const netIncome: number | null = latestInc.netIncome ?? null
    const revenue: number | null = latestInc.totalRevenue ?? null
    const grossProfit: number | null = latestInc.grossProfit ?? null
    const ebit: number | null = latestInc.operatingIncome ?? latestInc.cleanEbit ?? latestInc.ebit ?? null
    const ebitdaInc: number | null = latestInc.cleanEbitda ?? latestInc.ebitda ?? null

    // Indicadores derivados (fallback quando financialData está ausente)
    const vpaCalc = equity && sharesOut && sharesOut > 0 ? equity / sharesOut : null
    const lpaCalc = netIncome && sharesOut && sharesOut > 0 ? netIncome / sharesOut : null
    const roeCalc = netIncome && equity && equity !== 0 ? netIncome / equity : null
    const roaCalc = netIncome && totalAssets && totalAssets !== 0 ? netIncome / totalAssets : null

    const lpaVal = round2(r.earningsPerShare ?? ks.trailingEps ?? lpaCalc)
    const vpaVal = round2(ks.bookValue ?? vpaCalc)

    // ─── Indicadores fundamentalistas atuais ──────────────────────────────────
    // financialData (Pro): fornece ROE, ROA, margens, currentRatio, debtToEquity precisos
    const fundamentals = {
      pl:               round2(r.priceEarnings ?? ks.trailingPE),
      pvp:              round2(ks.priceToBook) ??
                          (vpaVal && currentPrice > 0 ? round2(currentPrice / vpaVal) : null),
      dy:               pct(ks.dividendYield ?? ks.yield),
      roe:              pct(fd.returnOnEquity)   ?? pct(roeCalc),
      roa:              pct(fd.returnOnAssets)   ?? pct(roaCalc),
      roic:             null as number | null,
      lpa:              lpaVal,
      vpa:              vpaVal,
      evEbitda:         round2(ks.enterpriseToEbitda),
      evReceita:        round2(ks.enterpriseToRevenue),
      psr:              round2(ks.enterpriseToRevenue),
      margemLiquida:    pct(fd.profitMargins)    ??
                          (netIncome && revenue && revenue !== 0 ? pct(netIncome / revenue) : null),
      margemBruta:      pct(fd.grossMargins)     ??
                          (grossProfit != null && revenue && revenue !== 0 ? pct(grossProfit / revenue) : null),
      margemEbit:       pct(fd.operatingMargins) ??
                          (ebit && revenue && revenue !== 0 ? pct(ebit / revenue) : null),
      margemEbitda:     pct(fd.ebitdaMargins)    ??
                          (ebitdaInc && revenue && revenue !== 0 ? pct(ebitdaInc / revenue) : null),
      liquidezCorrente: round2(fd.currentRatio)  ??
                          (latestBs.totalCurrentAssets && (latestBs.totalCurrentLiabilities ?? latestBs.currentLiabilities)
                            ? round2(latestBs.totalCurrentAssets / (latestBs.totalCurrentLiabilities ?? latestBs.currentLiabilities))
                            : null),
      dividaLiquidaPatrimonio:
                        fd.debtToEquity != null
                          ? round2(fd.debtToEquity / 100)
                          : (equity && equity !== 0 && grossDebt > 0 ? round2((grossDebt - cashBs) / equity) : null),
      dividendPayout:   null as number | null,
    }

    // ─── Histórico de indicadores (últimos 6 anos) ────────────────────────────
    // defaultKeyStatisticsHistory: P/L, P/VP, LPA, VPA, DY, preço, market cap
    // financialDataHistory (Pro): ROE, ROA, margens por ano
    const ksh = yearlyEntries(r.defaultKeyStatisticsHistory).slice(-10)
    const fdh = yearlyEntries(r.financialDataHistory)
    const fdhByYear = new Map(fdh.map((x: any) => [x.endDate?.slice(0, 4), x]))
    const incByYear = new Map(inch.map((x: any) => [x.endDate?.slice(0, 4), x]))
    const bsByYear  = new Map(bsh.map((x: any) => [x.endDate?.slice(0, 4), x]))

    const fundamentalsHistory = ksh.map((x: any) => {
      const year = x.endDate?.slice(0, 4) ?? '?'
      const inc  = incByYear.get(year) as any
      const bs   = bsByYear.get(year)  as any
      const fdy  = fdhByYear.get(year) as any // financialDataHistory para o ano

      // Fallbacks de cálculo para quando os módulos históricos não trazem o valor
      const bsEquity: number | null = bs?.totalStockholderEquity ?? bs?.shareholdersEquity ?? null
      const sharesHist: number | null = x.sharesOutstanding ?? sharesOut ?? null
      const roeCalcHist = inc?.netIncome && bsEquity && bsEquity !== 0
        ? inc.netIncome / bsEquity : null
      const vpaCalcHist = bsEquity && sharesHist && sharesHist > 0
        ? bsEquity / sharesHist : null
      const lpaCalcHist = inc?.netIncome && sharesHist && sharesHist > 0
        ? inc.netIncome / sharesHist : null

      return {
        year,
        pl:           round2(x.trailingPE),
        pvp:          round2(x.priceToBook),
        lpa:          round2(x.earningsPerShare)    ?? round2(lpaCalcHist),
        vpa:          round2(x.bookValue)            ?? round2(vpaCalcHist),
        dy:           pct(x.dividendYield ?? x.yield),
        roe:          pct(fdy?.returnOnEquity)       ?? pct(roeCalcHist),
        roa:          pct(fdy?.returnOnAssets)       ?? null,
        margemLiquida:pct(fdy?.profitMargins)        ??
                        pct(inc?.netIncome && inc?.totalRevenue ? inc.netIncome / inc.totalRevenue : null),
        margemEbitda: pct(fdy?.ebitdaMargins)        ?? null,
        price:        round2(x.price),
        marketCap:    round0(x.marketCap),
      }
    })

    // ─── Histórico de receita, lucros e fluxo de caixa ───────────────────────
    const cfh = yearlyEntries(r.cashflowHistory)
    const cfByYear = new Map(cfh.map((x: any) => [x.endDate?.slice(0, 4), x]))

    const yearlyInc = inch.slice(-10) // últimos 10 anos para o gráfico
    const incomeHistory = yearlyInc.map((x: any) => {
      const year = x.endDate?.slice(0, 4) ?? '?'
      const cf  = cfByYear.get(year) as any
      const ksy = ksh.find((k: any) => k.endDate?.slice(0, 4) === year) as any

      // Fallback para netIncome quando incomeStatementHistory não traz o valor:
      // Método 1: LPA × ações em circulação (mais preciso — usa dados históricos reais)
      // Método 2: marketCap / P/L (fallback secundário)
      const netIncomeCalc = (() => {
        if (x.netIncome != null) return x.netIncome
        const eps    = ksy?.earningsPerShare
        const shares = ksy?.sharesOutstanding ?? sharesOut
        if (eps != null && shares && shares > 0) return eps * shares
        if (ksy?.marketCap && ksy?.trailingPE && ksy.trailingPE !== 0)
          return ksy.marketCap / ksy.trailingPE
        return null
      })()

      return {
        year,
        revenue:           round0(x.totalRevenue),
        netIncome:         round0(netIncomeCalc),
        grossProfit:       round0(x.grossProfit),
        ebitda:            round0(x.cleanEbitda ?? x.ebitda),
        operatingCashflow: round0(cf?.operatingCashFlow ?? cf?.operatingCashflow),
        freeCashflow:      round0(cf?.freeCashFlow ?? cf?.freeCashflow),
      }
    })

    // ─── LPA × Cotação ────────────────────────────────────────────────────────
    const decPrices = new Map<string, number>()
    for (const p of sortedHistory) {
      const y = String(new Date(p.date * 1000).getUTCFullYear())
      decPrices.set(y, p.close) // sobrescreve — fica com o último (dez)
    }
    const lpaVsPrice = ksh.map((x: any) => ({
      year:  x.endDate?.slice(0, 4) ?? '?',
      lpa:   round2(x.earningsPerShare),
      price: round2(decPrices.get(x.endDate?.slice(0, 4)) ?? x.price),
    }))

    // ─── Dividendos ───────────────────────────────────────────────────────────
    const dividends = dividendsRaw
      .filter(d => d.rate > 0)
      .map(d => ({
        payDate: d.paymentDate ? new Date(d.paymentDate).toISOString().slice(0, 10) : null,
        exDate:  d.lastDatePrior ? new Date(d.lastDatePrior).toISOString().slice(0, 10) : null,
        value:   round4(d.rate)!,
        type:    d.label ?? 'DIVIDENDO',
      }))
      .sort((a, b) => (b.payDate ?? '') < (a.payDate ?? '') ? -1 : 1)

    // divByYear (exDate): para DY% — valores brutos conforme declarado pela empresa
    const divByYear = new Map<string, number>()
    for (const d of dividends) {
      const ref = d.exDate ?? d.payDate
      if (!ref) continue
      divByYear.set(ref.slice(0, 4), (divByYear.get(ref.slice(0, 4)) ?? 0) + d.value)
    }

    // divByYearPay (payDate + bruto): para Payout — perspectiva da empresa (bruto antes de IR)
    const divByYearPay = new Map<string, number>()
    for (const d of dividends) {
      const ref = d.payDate ?? d.exDate
      if (!ref) continue
      divByYearPay.set(ref.slice(0, 4), (divByYearPay.get(ref.slice(0, 4)) ?? 0) + d.value)
    }
    const dividendsPerYear = Array.from(divByYear.entries())
      .sort(([a], [b]) => a < b ? -1 : 1)
      .map(([year, total]) => {
        const price = decPrices.get(year)
        const dy = price && price > 0
          ? Math.round((total / price) * 10000) / 100
          : null
return { year, total: round2(total)!, dy }
      })

    // ─── Payout ───────────────────────────────────────────────────────────────
    const mostRecentKshYear = ksh.length > 0 ? ksh[ksh.length - 1]?.endDate?.slice(0, 4) : null
    const payoutByYear = yearlyInc.map((x: any) => {
      const year        = x.endDate?.slice(0, 4) ?? '?'
      const divPerShare = divByYearPay.get(year)   // usa payDate: o que foi pago no ano fiscal
      if (!divPerShare) return { year, payout: null as number | null }

      const ksy = ksh.find((k: any) => k.endDate?.slice(0, 4) === year)
      // Para o ano mais recente o histórico pode estar incompleto: prefere lpaVal (trailing atual)
      const lpa = (year === mostRecentKshYear ? null : ksy?.earningsPerShare)
               ?? lpaVal
               ?? ksy?.earningsPerShare
      if (lpa && lpa > 0)
        return { year, payout: Math.round((divPerShare / lpa) * 10000) / 100 }

      // Fallback: totalDividendos / lucroLíquido via ações em circulação
      const sharesHist: number | null = ksy?.sharesOutstanding ?? sharesOut
      const netIncome = x.netIncome
      if (netIncome && netIncome !== 0 && sharesHist && sharesHist > 0)
        return { year, payout: Math.round((divPerShare * sharesHist / netIncome) * 10000) / 100 }

      return { year, payout: null as number | null }
    })

    // ─── Comunicados ─────────────────────────────────────────────────────────
    const { items: comunicados, fallbackUrl: comunicadosUrl } = await fetchComunicados(ticker.toUpperCase(), profile.name, profile.cnpj)

    return {
      profile,
      quote: quote_out,
      rentabilidade,
      priceHistory: priceHistoryOut,
      fundamentals,
      fundamentalsHistory,
      incomeHistory,
      lpaVsPrice,
      dividends: dividends.slice(0, 50),
      dividendsPerYear,
      payoutByYear,
      comunicados,
      comunicadosUrl,
    }
  })
}
