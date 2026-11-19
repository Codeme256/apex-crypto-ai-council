import { snapshot } from './market.ts'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  JOURNAL?: { prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> }
    first<T>(): Promise<T | null>
  } }
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request)
    const headers = { 'Cache-Control': 'no-store' }
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } })
    if (path !== '/api/desk') return new Response(null, { status: 404 })
    try {
      const desk = await snapshot()
      const lastRun = await env.JOURNAL?.prepare(
        'SELECT observed_at, decision FROM decisions ORDER BY observed_at DESC LIMIT 1'
      ).first()
      return Response.json({ ...desk, lastRun, journalEnabled: !!env.JOURNAL }, { headers })
    } catch {
      return Response.json({ error: 'Market snapshot unavailable', observedAt: Date.now() }, { status: 503, headers })
    }
  },
  async scheduled(event: { scheduledTime: number }, env: Env) {
    if (!env.JOURNAL) throw new Error('Decision journal binding is required')
    let desk: Awaited<ReturnType<typeof snapshot>> | null = null
    try { desk = await snapshot() } catch { /* Persist the unsuccessful run. */ }
    const key = Math.floor(event.scheduledTime / 60_000)
    await env.JOURNAL.prepare(
      'INSERT OR IGNORE INTO decisions (run_key, observed_at, market_slug, decision, snapshot_json) VALUES (?, ?, ?, ?, ?)'
    ).bind(key, desk?.observedAt ?? Date.now(), desk?.market.slug ?? null,
      desk?.skipped ?? 'Market snapshot unavailable', desk ? JSON.stringify(desk) : null).run()
    if (key % 60 === 0) {
      await env.JOURNAL.prepare('DELETE FROM decisions WHERE run_key < ?')
        .bind(key - 30 * 24 * 60).run()
    }
  },
}
