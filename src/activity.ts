export type WeatherKind = 'calm' | 'breezy' | 'stormy' | 'lightning'
export type Token = { name?: string; symbol?: string; decimals?: string; type?: string }
export type ChainTransfer = {
  transaction_hash: string
  log_index: number
  from: { hash: string }
  to: { hash: string }
  total: { value: string }
  timestamp: string
}
export type Transfer = { id: string; hash: string; from: string; to: string; value: string; exactValue: string; timestamp: string }
export type TokenActivity = {
  address: string; name: string; symbol: string; transferCount: number; previousCount: number
  uniqueSenders: number; uniqueReceivers: number; largestTransfer: string; largestExact: string
  activityChange: number | null; weather: WeatherKind; summary: string; endTime: number
  transfers: Transfer[]; bins: number[]; isDemo: boolean
}
export const SAMPLE_ADDRESS = '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
export const PERIOD_MS = 60 * 1000
export const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)
export const shorten = (value: string, chars = 5) => value.length < chars * 2 + 3 ? value : `${value.slice(0, chars + 2)}…${value.slice(-chars)}`

export function exactUnits(raw: string, decimals: number) {
  const digits = BigInt(raw).toString().padStart(decimals + 1, '0')
  const whole = decimals ? digits.slice(0, -decimals) : digits
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, '') : ''
  return `${BigInt(whole).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`
}
export function formatValue(raw: string, decimals: number, symbol: string) {
  const amount = Number(BigInt(raw)) / 10 ** decimals
  if (amount === 0) return `0 ${symbol}`
  const formatted = amount < .000001
    ? amount.toExponential(2)
    : new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 4 }).format(amount)
  return `${formatted} ${symbol}`
}

export function classify(count: number, previousCount: number): { weather: WeatherKind; summary: string } {
  const change = previousCount ? (count - previousCount) / previousCount : count ? Infinity : 0
  if (count >= 20 && change >= .65) return { weather: 'lightning', summary: 'A sudden spike was detected.' }
  if (count >= 100) return { weather: 'stormy', summary: 'Heavy transfer activity is moving through this token.' }
  if (count >= 10 && change >= .18) return { weather: 'breezy', summary: 'Transfer activity is increasing.' }
  if (count === 0) return { weather: 'calm', summary: 'No transfers in this window. The skies are clear.' }
  return { weather: 'calm', summary: 'Activity is calm.' }
}

export function makeActivity(address: string, token: Token, items: ChainTransfer[], endTime: number, isDemo = false): TokenActivity {
  const decimals = Number(token.decimals)
  const symbol = token.symbol || 'TOKEN'
  const unique = [...new Map(items.map(item => [`${item.transaction_hash}:${item.log_index}`, item])).values()]
  const current = unique.filter(item => {
    const time = Date.parse(item.timestamp)
    return time > endTime - PERIOD_MS && time <= endTime
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.log_index - a.log_index)
  const previous = unique.filter(item => {
    const time = Date.parse(item.timestamp)
    return time > endTime - 2 * PERIOD_MS && time <= endTime - PERIOD_MS
  })
  const largest = current.reduce<ChainTransfer | undefined>((winner, item) => !winner || BigInt(item.total.value) > BigInt(winner.total.value) ? item : winner, undefined)
  const bins = Array.from({ length: 5 }, (_, i) => current.filter(item => {
    const time = Date.parse(item.timestamp)
    const binMs = PERIOD_MS / 5
    return time > endTime - PERIOD_MS + i * binMs && time <= endTime - PERIOD_MS + (i + 1) * binMs
  }).length)
  return {
    address, name: token.name || 'Unnamed token', symbol, isDemo, endTime,
    transferCount: current.length, previousCount: previous.length,
    uniqueSenders: new Set(current.map(item => item.from.hash.toLowerCase())).size,
    uniqueReceivers: new Set(current.map(item => item.to.hash.toLowerCase())).size,
    largestTransfer: largest ? formatValue(largest.total.value, decimals, symbol) : 'None',
    largestExact: largest ? `${exactUnits(largest.total.value, decimals)} ${symbol}` : 'No transfers in this window',
    activityChange: previous.length ? Math.round((current.length - previous.length) / previous.length * 100) : current.length ? null : 0,
    ...classify(current.length, previous.length), bins,
    transfers: current.slice(0, 5).map(item => ({
      id: `${item.transaction_hash}:${item.log_index}`, hash: item.transaction_hash,
      from: item.from.hash, to: item.to.hash, timestamp: item.timestamp,
      value: formatValue(item.total.value, decimals, symbol), exactValue: `${exactUnits(item.total.value, decimals)} ${symbol}`,
    })),
  }
}

export class ForecastError extends Error {
  constructor(message: string, public kind: 'address' | 'service' = 'service') { super(message) }
}

export async function fetchActivity(address: string, signal: AbortSignal, onProgress: (message: string) => void): Promise<TokenActivity> {
  const endTime = Date.now()
  const base = `https://eth.blockscout.com/api/v2/tokens/${address}`
  async function getJson(url: string): Promise<unknown> {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (response.status === 404) throw new ForecastError('No indexed token at this address. Check that it is an ERC-20 contract on Ethereum mainnet.', 'address')
    if (response.status === 429) throw new ForecastError('The explorer is busy. Wait a moment, then try again.')
    if (!response.ok) throw new ForecastError('The explorer could not load this forecast. Try again in a moment.')
    return response.json()
  }
  onProgress('Checking the token contract…')
  const token = await getJson(base) as Token
  if (token.type !== 'ERC-20') throw new ForecastError('This contract is not an indexed ERC-20 token. Enter an ERC-20 address on Ethereum mainnet.', 'address')
  if (token.decimals == null || !/^\d+$/.test(token.decimals) || Number(token.decimals) > 255) throw new ForecastError('The explorer has no valid token precision yet. Try another token or check again later.')
  let url = `${base}/transfers`
  const items: ChainTransfer[] = []
  const visited = new Set<string>()
  for (let page = 0; page < 40; page++) {
    onProgress(`Reading transfers · page ${page + 1} of up to 40…`)
    if (visited.has(url)) throw new ForecastError('The explorer repeated a page. Try again for a complete forecast.')
    visited.add(url)
    const data = await getJson(url) as { items?: ChainTransfer[]; next_page_params?: Record<string, unknown> | null }
    if (!Array.isArray(data.items)) throw new ForecastError('The explorer returned an unreadable response. Try again later.')
    for (const item of data.items) {
      if (!Number.isFinite(Date.parse(item.timestamp)) || !isAddress(item.from?.hash ?? '') || !isAddress(item.to?.hash ?? '') || !/^\d+$/.test(item.total?.value ?? '') || !/^0x[a-fA-F0-9]{64}$/.test(item.transaction_hash ?? '') || !Number.isInteger(item.log_index)) {
        throw new ForecastError('The explorer returned incomplete transfer data. Try again for a complete forecast.')
      }
    }
    items.push(...data.items)
    if (!data.next_page_params || data.items.some(item => Date.parse(item.timestamp) <= endTime - 2 * PERIOD_MS)) {
      return makeActivity(address, token, items, endTime)
    }
    if (!data.items.length) throw new ForecastError('The explorer returned an empty page with more results pending. Try again later.')
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(data.next_page_params)) if (value != null) params.set(key, String(value))
    url = `${base}/transfers?${params}`
  }
  throw new ForecastError('This token exceeded the 2,000-transfer scan limit. Try again when traffic settles or open it on Etherscan. No partial forecast was substituted.')
}

export function demoActivity(): TokenActivity {
  const endTime = Date.UTC(2026, 8, 30, 10, 0)
  const amounts = ['28400000000000', '6800000000000', '4200000000000', '1900000000000', '860000000000']
  const address = (i: number) => `0x${i.toString(16).padStart(40, '0')}`
  const items = Array.from({ length: 263 }, (_, i): ChainTransfer => ({
    transaction_hash: `0x${(i + 1000000).toString(16).padStart(64, '0')}`, log_index: i,
    from: { hash: address(i % 91 + 5000) }, to: { hash: address(i % 108 + 7000) },
    total: { value: amounts[i] || `${(i + 1) * 1700000}` },
    timestamp: new Date(endTime - (i < 184 ? 300 * (i + 1) : PERIOD_MS + (i - 183) * 350)).toISOString(),
  }))
  return makeActivity(SAMPLE_ADDRESS, { name: 'USD Coin', symbol: 'USDC', decimals: '6' }, items, endTime, true)
}
