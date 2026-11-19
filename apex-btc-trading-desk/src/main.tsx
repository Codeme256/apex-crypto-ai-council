import { useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import type { Snapshot } from '../worker/market.ts'
import './style.css'

type Desk = Snapshot & {
  journalEnabled: boolean
  lastRun?: { observed_at: number; decision: string }
  analysisConfigured: boolean
  analysis?: { observed_at: number; status: string; summary: string | null }
}
const roles = [
  ['Spotter', 'Market and data checks'], ['Prior', 'Calibrated probability'],
  ['Edge', 'Net executable value'], ['Kelly', 'Risk and sizing'],
  ['Taker', 'Execution'], ['Closer', 'Reconciliation'],
]
const formatTime = (time: number, timeZone?: string) =>
  new Intl.DateTimeFormat(undefined, { timeStyle: 'medium', timeZone }).format(time)

function App() {
  const [desk, setDesk] = useState<Desk | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const abort = new AbortController()
    let retry: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const response = await fetch('/api/desk', { signal: abort.signal })
        if (!response.ok) throw new Error('Market snapshot unavailable')
        setDesk(await response.json() as Desk)
        setError('')
      } catch {
        if (!abort.signal.aborted) { setDesk(null); setError('Market snapshot unavailable') }
      } finally {
        if (!abort.signal.aborted) retry = setTimeout(refresh, 10_000)
      }
    }
    void refresh()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { abort.abort(); clearInterval(clock); clearTimeout(retry) }
  }, [])

  const market = desk?.market
  const seconds = market ? Math.max(0, Math.ceil((market.end - now) / 1000)) : 0
  const marketStatus = market ? (seconds && market.open ? 'OPEN' : 'CLOSED') : 'UNAVAILABLE'
  const freshBooks = desk?.books.filter(book => now - book.timestamp <= 15_000 && seconds > 0) ?? []

  return <main>
    <header><div><span className="brand">APEX / RESEARCH</span><h1>BTC Trading Desk</h1></div>
      <span className="badge">RESEARCH · LIVE DISARMED</span></header>
    <div className="grid">
      <section className="panel">
        <div className="section-heading"><h2>BTC Up / Down</h2><span className="badge">{marketStatus}</span></div>
        <p>{market?.question ?? (error || 'Loading Polymarket snapshot…')}</p>
        <div className="countdown">{market ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '—'}</div>
        {market && <p>Expiry {formatTime(market.end, 'UTC')} UTC · {formatTime(market.end)} local</p>}
        {desk && <p>Polymarket snapshot {formatTime(desk.observedAt, 'UTC')} UTC</p>}
        <p>BTC reference chart pending verified oracle data.</p>
        {market && <details><summary>Market rules</summary><p>{market.rules}</p>
          <p>{market.reference ?? 'Reference source unavailable'}</p></details>}
      </section>
      <section className="panel"><h2>Outcome books</h2>
        {freshBooks.length ? freshBooks.map(book => <div className="book" key={book.token}>
          <h3>{book.outcome}</h3><p>{formatTime(book.timestamp, 'UTC')} UTC</p>
          <table><thead><tr><th>Side</th><th>Price</th><th>Size</th></tr></thead><tbody>
            {(['bids', 'asks'] as const).flatMap(side => book[side].map((level, index) =>
              <tr key={side + index}><td>{side === 'bids' ? 'Bid' : 'Ask'}</td><td>{level.price}</td><td>{level.size}</td></tr>))}
          </tbody></table>
        </div>) : <p>Waiting for fresh executable quotes.</p>}
      </section>
    </div>
    <section className="panel workflow">
      <div className="section-heading"><h2>Six-agent workflow</h2>
        <span className="badge">{desk?.lastRun ? 'SCHEDULED RUN RECORDED' : 'AWAITING SCHEDULED RUN'}</span>
      </div>
      <div className="orbit" aria-hidden="true">
        <div className="orbit-track" /><div className="orbit-track orbit-track-inner" />
        <div className="orbit-core"><b>APEX</b><span>{freshBooks.length === 2 ? 'OBSERVING' : 'STANDBY'}</span></div>
        {roles.map(([name], index) => <div className="orbit-node" key={name}
          data-observing={index === 0 && freshBooks.length === 2}
          style={{ '--angle': (index * 60) + 'deg', '--hue': [169, 218, 270, 42, 12, 316][index] } as CSSProperties}>
          <span>{name}</span>
        </div>)}
      </div>
      <div className="workflow-sequence">Direction <span>→</span> Strength <span>→</span> Filter</div>
      <div className="agents">
        {roles.map(([name, purpose], i) => <div className="agent" key={name}><h3>{name}</h3><p>{purpose}</p>
          <small>{i === 0 && freshBooks.length === 2 ? 'Quotes observed' : 'Blocked'}</small></div>)}
      </div>
    </section>
    <section className="panel"><h2>Trading readiness</h2>
      <ul>
        <li>Exact BTC settlement feed and price chart pending authentication and verification.</li>
        <li>Probability model pending walk-forward calibration against resolved market data.</li>
        <li>Automated Demo fills and settlement pending integration.</li>
        <li>Live execution disarmed. Owner onboarding and venue preflight are required.</li>
      </ul>
    </section>
    <section className="panel"><h2>Grok market notes</h2>
      <p>{!desk?.analysisConfigured ? 'Waiting for the APInex Worker secret.' :
        desk.analysis?.summary ?? (desk.analysis?.status === 'unavailable' ?
          'Latest provider request unavailable.' : 'Waiting for the next hourly analysis.')}</p>
      {desk?.analysisConfigured && desk.analysis?.summary &&
        <p>Quotes observed {formatTime(desk.analysis.observed_at, 'UTC')} UTC</p>}
    </section>
    <div className="grid">
      <section className="panel"><h2>Demo portfolio</h2><div className="amount">$1,000.00</div>
        <p>Starting balance · zero trades · zero positions</p></section>
      <section className="panel"><h2>Decision journal</h2>
        <p aria-live="polite">{desk?.skipped ?? (error || 'Waiting for snapshot')}</p>
        <p>{desk?.lastRun ? formatTime(desk.lastRun.observed_at, 'UTC') + ' UTC · ' + desk.lastRun.decision :
          desk?.journalEnabled ? 'Waiting for first scheduled decision' : 'Scheduled journal unavailable'}</p>
      </section>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
