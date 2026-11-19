import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBook, parseMarket } from './market.ts'
import worker from './index.ts'

const start = 1_800_000_000_000
const condition = '0x' + 'a'.repeat(64)
const marketData = {
  slug: 'btc-updown-5m-' + start / 1000, conditionId: condition,
  endDate: new Date(start + 300_000).toISOString(),
  question: 'BTC Up or Down?', description: 'Fixture', closed: false, acceptingOrders: true,
  outcomes: '["Down","Up"]', clobTokenIds: '["8","9"]',
}
const market = parseMarket(marketData, start)
const book = {
  asset_id: '9', market: condition, timestamp: String(start),
  asks: [{ price: '0.6', size: '2' }, { price: '0.5', size: '2' }], bids: [],
}

test('maps outcomes by name and rejects a different window', () => {
  assert.deepEqual(market.tokens, { Up: '9', Down: '8' })
  assert.throws(() => parseMarket(marketData, start + 300_000))
})

test('sorts executable asks and rejects stale or mismatched quotes', () => {
  assert.equal(parseBook(book, market, 'Up', start).asks[0].price, '0.5')
  assert.throws(() => parseBook(book, market, 'Down', start))
  assert.throws(() => parseBook(book, market, 'Up', start + 15_001))
})

test('rejects mutating API calls', async () => {
  const response = await worker.fetch(new Request('https://local/api/desk', { method: 'POST' }), {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  })
  assert.equal(response.status, 405)
})

test('journals an unavailable feed without attempting a trade', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  const calls: unknown[][] = []
  await worker.scheduled({ scheduledTime: start }, {
    ASSETS: { fetch: async () => new Response(null) },
    JOURNAL: { prepare(sql) {
      assert.match(sql, /INSERT OR IGNORE/)
      return {
        bind(...values) { calls.push(values); return { run: async () => {} } },
        first: async () => null,
      }
    } },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], start / 60_000)
  assert.equal(calls[0][3], 'Market snapshot unavailable')
})
