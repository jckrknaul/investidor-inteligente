// URL do Investidor10 para análise de um ativo
// Quando assetClass é conhecido, mapeia para o segmento correto.
// Sem assetClass, usa heurística pelo sufixo do ticker (11 → FII).
export function investidor10Url(ticker: string, assetClass?: string): string {
  const t = ticker.toLowerCase()
  let segment = 'acoes'
  if (assetClass) {
    if (assetClass === 'FII') segment = 'fiis'
    else if (assetClass === 'BDR') segment = 'bdrs'
    else if (assetClass === 'ETF') segment = 'etfs'
    else if (assetClass === 'CRYPTO') segment = 'criptomoedas'
  } else if (/11$/.test(t)) {
    segment = 'fiis'
  }
  return `https://investidor10.com.br/${segment}/${t}/`
}
