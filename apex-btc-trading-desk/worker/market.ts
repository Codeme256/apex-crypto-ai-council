type Outcome = 'Up' | 'Down'
type Level = { price: string; size: string }
export type Book = { token: string; outcome: Outcome; timestamp: number; tickSize: string | null; minOrderSize: string | null; bids: Level[]; asks: Level[] }
export type Market = {
  slug: string; condition: string; end: number; start: number; question: string
  rules: string; reference: string | null; open: boolean; tokens: Record<Outcome, string>
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid venue response')
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) throw new Error('Invalid venue array')
  return parsed
}

const interval = 300_000
export function currentWindow(now: number) {
  return Math.floor(now / interval) * interval
}

export function parseMarket(value: unknown, start: number): Market {
  const entry = record(value)
  const slug = 'btc-updown-5m-' + start / 1000
  const end = Date.parse(String(entry.endDate))
  if (entry.slug !== slug || end !== start + interval ||
      typeof entry.conditionId !== 'string' || !/^0x[a-f0-9]{64}$/i.test(entry.conditionId) ||
      typeof entry.question !== 'string' || typeof entry.description !== 'string' ||
      !entry.description.trim() || typeof entry.closed !== 'boolean' ||
      typeof entry.acceptingOrders !== 'boolean') throw new Error('Unexpected market metadata')

  const outcomes = array(entry.outcomes)
  const ids = array(entry.clobTokenIds)
  const up = ids[outcomes.indexOf('Up')]
  const down = ids[outcomes.indexOf('Down')]
  if (outcomes.length !== 2 || ids.length !== 2 || typeof up !== 'string' ||
      typeof down !== 'string' || up === down || !/^\d+$/.test(up) ||
      !/^\d+$/.test(down)) throw new Error('Invalid outcome mapping')

  return {
    slug, condition: entry.conditionId, end, start, question: entry.question,
    rules: entry.description, reference: typeof entry.resolutionSource === 'string' ?
      entry.resolutionSource || null : null,
    open: !entry.closed && entry.acceptingOrders,
    tokens: { Up: up, Down: down },
  }
}

export function parseBook(value: unknown, market: Market, outcome: Outcome, now: number): Book {
  const entry = record(value)
  const token = market.tokens[outcome]
  const timestamp = Number(entry.timestamp)
  if (entry.asset_id !== token || entry.market !== market.condition ||
      !Number.isSafeInteger(timestamp) || timestamp > now + 1000 || now - timestamp > 15_000) {
    throw new Error('Stale or mismatched order book')
  }

  const levels = (input: unknown, direction: number) => array(input).map(item => {
    const { price, size } = record(item)
    if (typeof price !== 'string' || typeof size !== 'string' ||
        !/^\d+(\.\d+)?$/.test(price) || !/^\d+(\.\d+)?$/.test(size) ||
        Number(price) <= 0 || Number(price) >= 1 || Number(size) <= 0 ||
        !Number.isFinite(Number(size))) throw new Error('Invalid book level')
    return { price, size }
  }).sort((a, b) => direction * (Number(a.price) - Number(b.price))).slice(0, 5)

  const decimal = (input: unknown) => typeof input === 'string' && /^\d+(\.\d+)?$/.test(input) ? input : null
  return { token, outcome, timestamp, tickSize: decimal(entry.tick_size),
    minOrderSize: decimal(entry.min_order_size), bids: levels(entry.bids, -1), asks: levels(entry.asks, 1) }
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(4_000) })
  if (!response.ok) throw new Error('Venue HTTP ' + response.status)
  return response.json()
}

export async function snapshot() {
  const start = currentWindow(Date.now())
  const market = await json('https://gamma-api.polymarket.com/markets/slug/btc-updown-5m-' + start / 1000)
    .then(value => parseMarket(value, start))
  const books = market.open ? await Promise.allSettled((['Up', 'Down'] as const).map(async outcome => {
    const value = await json('https://clob.polymarket.com/book?token_id=' + market.tokens[outcome])
    return parseBook(value, market, outcome, Date.now())
  })) : []
  const observedAt = Date.now()
  if (observedAt >= market.end) throw new Error('Market window rolled during collection')
  return {
    market, observedAt, books: books.flatMap(book => book.status === 'fulfilled' ? [book.value] : []),
    skipped: books.length === 2 && books.every(book => book.status === 'fulfilled') ?
      'Exact reference feed and calibrated model are pending' : 'Market or outcome books unavailable',
  }
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>
