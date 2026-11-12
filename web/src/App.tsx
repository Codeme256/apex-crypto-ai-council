import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import { api, type AgentReport, type Health, type Portfolio, type ScanResult } from "./lib/api";
import { AGENTS, agentMeta } from "./lib/agents";

type Ticker = { symbol: string; price: number | null; ok: boolean };
type Candle = { time: number; open: number; high: number; low: number; close: number };
type View = "War Room" | "Markets" | "Council" | "Risk & Portfolio" | "Backtest";
type BacktestResult = Record<string, unknown>;

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const INTERVALS = ["5m", "15m", "1h", "4h"];
const NAV: Array<[string, View]> = [["◈", "War Room"], ["⌁", "Markets"], ["◎", "Council"], ["⛨", "Risk & Portfolio"], ["◷", "Backtest"]];
const money = (n?: number) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const timeLabel = (n?: number) => n ? new Date(n).toLocaleTimeString() : "—";
const shortSymbol = (s: string) => s.endsWith("USDT") ? `${s.slice(0, -4)}/USDT` : s;

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<number>();
  const [view, setView] = useState<View>("War Room");

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([api.health(), api.portfolio(), api.ticker(SYMBOLS)]);
    const [h, p, t] = results;
    if (h.status === "fulfilled") setHealth(h.value);
    if (p.status === "fulfilled") setPortfolio(p.value);
    if (t.status === "fulfilled") setTickers(t.value.tickers);
    setError(results.some(r => r.status === "rejected")
      ? "Backend connection incomplete. Unavailable fields are intentionally left blank."
      : "");
    setUpdated(Date.now());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const runScan = async () => {
    setBusy("scan"); setError("");
    try {
      const result = await api.scan({ symbol, market: "SPOT", timeframe });
      setScan(result);
      if (result.portfolio) setPortfolio(result.portfolio);
    } catch (e) { setError(e instanceof Error ? e.message : "Scan request failed"); }
    finally { setBusy(""); }
  };

  const runCouncil = async () => {
    setBusy("council"); setError("");
    try { await api.councilTick(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Council tick failed"); }
    finally { setBusy(""); }
  };

  const runBacktest = async () => {
    setBusy("backtest"); setError("");
    try {
      const result = await api.backtest(symbol);
      setBacktest(result && typeof result === "object" ? result as BacktestResult : { result });
      setView("Backtest");
    } catch (e) { setError(e instanceof Error ? e.message : "Backtest request failed"); }
    finally { setBusy(""); }
  };

  const reports = scan?.reports ?? [];
  const healthy = ["ok", "healthy"].includes((health?.overall ?? "").toLowerCase());
  const tickerOk = tickers.filter(t => t.ok).length;
  const selectedPrice = tickers.find(t => t.symbol === symbol)?.price;

  return <div className="apex-shell">
    <aside className="apex-sidebar">
      <div className="apex-brand"><span className="apex-brand-mark">A</span><span className="apex-brand-copy"><strong>APEX WAR ROOM</strong><small>AI Trading Council</small></span></div>
      <div className="apex-nav-label">Workspace</div>
      <nav className="apex-nav" aria-label="Dashboard sections">
        {NAV.map(([icon, name]) => <button key={name} className={view === name ? "active" : ""} onClick={() => setView(name as View)}><span className="nav-icon">{icon}</span><span>{name}</span></button>)}
      </nav>
      <div className="apex-sidebar-bottom"><div className="apex-safe"><b>SAFE MODE</b><br />Paper-first dashboard. No order placement is available here.</div></div>
    </aside>

    <div className="apex-main">
      <header className="apex-topbar">
        <div className="apex-top-left"><span className="apex-menu">◈</span><span className="apex-status"><i className={`status-dot ${healthy ? "ok" : "warn"}`} />{health ? healthy ? "API ONLINE" : `API ${health.overall.toUpperCase()}` : "API STATUS UNKNOWN"}</span></div>
        <div className="apex-top-right"><span className="apex-mode">{portfolio?.mode ?? health?.modeDefault ?? "MODE UNKNOWN"}</span><span className="apex-top-time">Updated {timeLabel(updated)}</span></div>
      </header>

      <main className="apex-content">
        <div className="apex-heading"><div><h1>{view}</h1><p>Live project signals from configured APIs. No fabricated agent chat, balance, or performance data.</p></div><div className="apex-controls"><select className="apex-select" aria-label="Selected symbol" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.map(s => <option key={s}>{s}</option>)}</select><button className="apex-button" onClick={() => void refresh()}>↻ Refresh</button></div></div>
        {error && <div className="apex-alert apex-error" role="alert">{error}</div>}

        {view === "War Room" && <>
          <PortfolioCards portfolio={portfolio} />
          <div className="apex-grid apex-layout-main">
            <section className="apex-card"><div className="apex-card-head"><div><h2>Live market chart</h2><small>Public Binance Spot candles · read-only</small></div><div className="apex-chart-controls">{INTERVALS.map(tf => <button key={tf} className={timeframe === tf ? "selected" : ""} onClick={() => setTimeframe(tf)}>{tf}</button>)}</div></div><CandleChart symbol={symbol} interval={timeframe} /></section>
            <MarketPanel tickers={tickers} price={selectedPrice} symbol={symbol} />
          </div>
          <div className="apex-grid apex-lower-grid"><CouncilPanel reports={reports} onScan={runScan} onTick={runCouncil} busy={busy} scan={scan} symbol={symbol} timeframe={timeframe} onTimeframe={setTimeframe} /><RiskPanel portfolio={portfolio} /></div>
        </>}

        {view === "Markets" && <div className="apex-grid"><div className="apex-grid apex-kpis"><Kpi label="Ticker feeds" value={`${tickerOk}/${tickers.length || "—"}`} foot="Backend-reported public prices" /><Kpi label="Selected pair" value={shortSymbol(symbol)} foot="Binance Spot public market data" /><Kpi label="Latest price" value={money(selectedPrice ?? undefined)} foot="Unavailable if feed is disconnected" /><Kpi label="Last refresh" value={timeLabel(updated)} foot="Auto-refresh every 15 seconds" /></div><div className="apex-grid apex-layout-main"><section className="apex-card"><div className="apex-card-head"><div><h2>{shortSymbol(symbol)} candles</h2><small>Historical and recent candles fetched from Binance public market endpoint</small></div><div className="apex-chart-controls">{INTERVALS.map(tf => <button key={tf} className={timeframe === tf ? "selected" : ""} onClick={() => setTimeframe(tf)}>{tf}</button>)}</div></div><CandleChart symbol={symbol} interval={timeframe} /></section><MarketPanel tickers={tickers} price={selectedPrice} symbol={symbol} /></div><section className="apex-card"><div className="apex-card-head"><h2>Configured market feeds</h2><small>Live response status</small></div><TickerTable tickers={tickers} /></section></div>}

        {view === "Council" && <div className="apex-grid apex-section-grid"><CouncilPanel reports={reports} onScan={runScan} onTick={runCouncil} busy={busy} scan={scan} symbol={symbol} timeframe={timeframe} onTimeframe={setTimeframe} /><section className="apex-card"><div className="apex-card-head"><h2>Agent activity</h2><small>{reports.length} reports in latest scan</small></div><div className="apex-card-body"><AgentMessages reports={reports} /></div></section></div>}

        {view === "Risk & Portfolio" && <div className="apex-grid"><PortfolioCards portfolio={portfolio} /><div className="apex-grid apex-section-grid"><RiskPanel portfolio={portfolio} /><section className="apex-card"><div className="apex-card-head"><h2>Latest candidate gate</h2><small>From latest actual scan response</small></div><div className="apex-card-body">{scan ? <><p>Candidate: <b>{scan.candidate ? `${scan.candidate.symbol} ${scan.candidate.side}` : "None returned"}</b></p><p>Risk engine: <b className={`apex-badge ${scan.riskAllowed ? "good" : "bad"}`}>{scan.riskAllowed ? "ALLOWED" : "REJECTED / NO CANDIDATE"}</b></p>{scan.riskReasons?.length ? <ul>{scan.riskReasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}</> : <div className="apex-empty">Run a real scan to view its risk decision and reasons.</div>}</div></section></div></div>}

        {view === "Backtest" && <div className="apex-grid"><section className="apex-card"><div className="apex-card-head"><div><h2>Strategy validation</h2><small>Backend backtest only · historical outcomes do not guarantee future results</small></div><button className="apex-button primary" disabled={!!busy} onClick={() => void runBacktest()}>{busy === "backtest" ? "Running…" : `Run ${symbol} backtest`}</button></div><div className="apex-card-body">{backtest ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#a9bacd", fontSize: 11, margin: 0 }}>{JSON.stringify(backtest, null, 2)}</pre> : <div className="apex-empty">No backtest result loaded. Metrics remain blank until the backend returns actual evaluation results.</div>}</div></section><section className="apex-card"><div className="apex-card-head"><h2>Validation principles</h2><small>Interpret results carefully</small></div><div className="apex-card-body"><ul><li>Use out-of-sample validation where supported by the backend.</li><li>Include fees, spread, and slippage before interpreting strategy results.</li><li>Do not treat a small sample or past return as evidence of future profitability.</li></ul></div></section></div>}

        <footer className="apex-footer">APEX AI Trade War Room · public market chart + project API data · no live order execution in this interface.</footer>
      </main>
    </div>
  </div>;
}

function PortfolioCards({ portfolio }: { portfolio: Portfolio | null }) {
  return <div className="apex-grid apex-kpis"><Kpi label="Account equity" value={money(portfolio?.equity)} foot={portfolio ? `${portfolio.mode} · backend reported` : "Waiting for portfolio API"} /><Kpi label="Available balance" value={money(portfolio?.available)} foot={portfolio ? `As of ${timeLabel(portfolio.timestamp)}` : "Not available"} /><Kpi label="Daily P&L" value={money(portfolio?.dailyPnl)} foot="API-reported portfolio value" tone={portfolio == null ? "" : portfolio.dailyPnl >= 0 ? "good" : "bad"} /><Kpi label="Open positions" value={portfolio ? String(portfolio.openPositions) : "—"} foot={portfolio ? `${portfolio.consecutiveLosses} consecutive losses` : "Not available"} /></div>;
}

function Kpi({ label, value, foot, tone = "" }: { label: string; value: string; foot: string; tone?: string }) {
  return <section className="apex-card"><div className="apex-card-body"><div className="apex-kpi-label">{label}</div><div className={`apex-kpi-value ${tone === "good" ? "positive" : tone === "bad" ? "negative" : ""}`}>{value}</div><div className="apex-kpi-foot">{foot}</div></div></section>;
}

function CandleChart({ symbol, interval }: { symbol: string; interval: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("Loading public candle data…");
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    const chart = createChart(host.current, {
      autoSize: true,
      height: 350,
      layout: { background: { color: "#0b121b" }, textColor: "#8392a4" },
      grid: { vertLines: { color: "#172330" }, horzLines: { color: "#172330" } },
      rightPriceScale: { borderColor: "#22303e" },
      timeScale: { borderColor: "#22303e", timeVisible: true },
    });
    const series = chart.addCandlestickSeries({ upColor: "#36d6c3", downColor: "#fb7185", borderVisible: false, wickUpColor: "#36d6c3", wickDownColor: "#fb7185" });
    const load = async () => {
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=240`;
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Binance public candles returned HTTP ${response.status}`);
        const rows = await response.json() as unknown[][];
        if (!active) return;
        const candles: Candle[] = rows.map(r => ({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) }));
        series.setData(candles as never[]);
        chart.timeScale().fitContent();
        setState(`Public candle feed · ${candles.length} bars · refreshed ${new Date().toLocaleTimeString()}`);
      } catch (e) { if (active) setState(e instanceof Error ? e.message : "Candle data unavailable"); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const resize = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) chart.applyOptions({ width }); });
    resize.observe(host.current);
    return () => { active = false; window.clearInterval(timer); resize.disconnect(); chart.remove(); };
  }, [symbol, interval]);
  return <><div ref={host} className="apex-chart-wrap" /><div className="apex-card-body" style={{ paddingTop: 0 }}><small className="apex-muted">{state}</small></div></>;
}

function MarketPanel({ tickers, price, symbol }: { tickers: Ticker[]; price?: number | null; symbol: string }) {
  return <section className="apex-card"><div className="apex-card-head"><div><h2>Market scanner</h2><small>Configured public ticker snapshots</small></div><span className="apex-tag">{tickers.filter(t => t.ok).length}/{tickers.length || 0} feeds</span></div><div className="apex-card-body"><div className="apex-kpi-label">Selected · {shortSymbol(symbol)}</div><div className="apex-kpi-value">{money(price ?? undefined)}</div><TickerTable tickers={tickers} compact /></div></section>;
}

function TickerTable({ tickers, compact = false }: { tickers: Ticker[]; compact?: boolean }) {
  return <div className="apex-table-wrap"><table className="apex-table"><thead><tr><th>Pair</th><th>Last price</th><th>Status</th></tr></thead><tbody>{tickers.length ? tickers.map(t => <tr key={t.symbol}><td>{shortSymbol(t.symbol)}</td><td>{money(t.price ?? undefined)}</td><td><span className={`apex-badge ${t.ok ? "good" : "bad"}`}>{t.ok ? "LIVE" : "UNKNOWN"}</span></td></tr>) : <tr><td colSpan={3}>{compact ? "No ticker data available" : "No feed response from the API"}</td></tr>}</tbody></table></div>;
}

function CouncilPanel({ reports, onScan, onTick, busy, scan, symbol, timeframe, onTimeframe }: { reports: AgentReport[]; onScan: () => void; onTick: () => void; busy: string; scan: ScanResult | null; symbol: string; timeframe: string; onTimeframe: (v: string) => void }) {
  const reportMap = useMemo(() => new Map(reports.map(r => [r.agent, r])), [reports]);
  return <section className="apex-card"><div className="apex-card-head"><div><h2>AI War Room</h2><small>Actual reports returned by the latest scan API call</small></div><span className="apex-tag">{scan ? scan.decision?.decision ?? "ANALYZED" : "NO SCAN"}</span></div><div className="apex-card-body"><div className="apex-controls" style={{ marginBottom: 14 }}><select className="apex-select" aria-label="Analysis timeframe" value={timeframe} onChange={e => onTimeframe(e.target.value)}>{INTERVALS.map(tf => <option key={tf}>{tf}</option>)}</select><button className="apex-button primary" disabled={!!busy} onClick={onScan}>{busy === "scan" ? "Scanning…" : `Scan ${symbol}`}</button><button className="apex-button" disabled={!!busy} onClick={onTick}>{busy === "council" ? "Ticking…" : "Council tick"}</button></div>{scan?.candidate ? <div className="apex-alert">{scan.candidate.symbol} · {scan.candidate.side} · {scan.candidate.status}<br />Entry {scan.candidate.entry} · Stop {scan.candidate.stopLoss} · Target {scan.candidate.takeProfit} · R:R {Number(scan.candidate.rewardRisk).toFixed(2)}<br />Risk gate: <b>{scan.riskAllowed ? "Allowed by returned checks" : "Rejected"}</b>{scan.riskReasons?.length ? ` — ${scan.riskReasons.join("; ")}` : ""}</div> : scan ? <div className="apex-empty">The scan returned no candidate. No setup is being presented as active.</div> : null}{scan?.decision && <div className="apex-alert">Chief: <b>{scan.decision.decision}</b> — {scan.decision.rationale}</div>}<div className="apex-agent-list">{AGENTS.map(meta => <AgentCard key={meta.id} meta={meta} report={reportMap.get(meta.id)} />)}</div></div></section>;
}

function AgentCard({ meta, report }: { meta: (typeof AGENTS)[number]; report?: AgentReport }) {
  return <article className="apex-agent"><span className="apex-avatar">{meta.initial}</span><div><strong>{meta.name} <span className="apex-muted">· {meta.role}</span></strong><p>{report?.summary ?? "No report from this agent in the latest scan."}{report?.objections?.length ? ` Objections: ${report.objections.join("; ")}` : ""}</p></div><span className={`apex-badge ${report?.advisoryVeto ? "warn" : report?.ok === false ? "bad" : report ? "good" : ""}`}>{report?.advisoryVeto ? "VETO" : report?.ok === false ? "ERROR" : report ? "REPORTED" : "AWAITING"}</span></article>;
}

function AgentMessages({ reports }: { reports: AgentReport[] }) {
  if (!reports.length) return <div className="apex-empty">No agent messages returned yet. Run a scan to show actual agent outputs here.</div>;
  return <div className="apex-agent-list">{reports.map((r, i) => { const meta = agentMeta(r.agent); return <article className="apex-agent" key={`${r.agent}-${i}`}><span className="apex-avatar">{meta.initial}</span><div><strong>{meta.name} {r.confidence == null ? "" : `· ${r.confidence}%`}</strong><p>{r.summary}{r.objections?.length ? ` Objections: ${r.objections.join("; ")}` : ""}</p></div><span className={`apex-badge ${r.advisoryVeto ? "warn" : ""}`}>{r.latencyMs == null ? "REPORT" : `${r.latencyMs}ms`}</span></article>; })}</div>;
}

function RiskPanel({ portfolio }: { portfolio: Portfolio | null }) {
  return <section className="apex-card"><div className="apex-card-head"><div><h2>Risk & execution guardrails</h2><small>Read-only portfolio state from backend</small></div><span className="apex-tag">NO ORDER CONTROL</span></div><div className="apex-card-body"><div className="apex-live-list"><div className="apex-live-row"><span className="apex-muted">Mode</span><span className="apex-symbol">{portfolio?.mode ?? "Unknown"}</span><span className="apex-badge">API</span></div><div className="apex-live-row"><span className="apex-muted">Circuit</span><span className="apex-symbol">{portfolio ? portfolio.circuitBreakerActive ? "Active" : "Clear" : "Unknown"}</span><span className={`apex-badge ${portfolio?.circuitBreakerActive ? "bad" : portfolio ? "good" : ""}`}>{portfolio ? portfolio.circuitBreakerActive ? "LOCKED" : "CLEAR" : "UNKNOWN"}</span></div><div className="apex-live-row"><span className="apex-muted">Kill switch</span><span className="apex-symbol">{portfolio ? portfolio.killSwitchActive ? "Active" : "Clear" : "Unknown"}</span><span className={`apex-badge ${portfolio?.killSwitchActive ? "bad" : portfolio ? "good" : ""}`}>{portfolio ? portfolio.killSwitchActive ? "ACTIVE" : "CLEAR" : "UNKNOWN"}</span></div><div className="apex-live-row"><span className="apex-muted">Weekly P&amp;L</span><span className="apex-symbol">{money(portfolio?.weeklyPnl)}</span><span className="apex-badge">REPORTED</span></div></div><div className="apex-footer">The dashboard cannot authorize live orders. Risk checks remain server-side.</div></div></section>;
}
