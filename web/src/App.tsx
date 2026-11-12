import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AgentReport, type Health, type Portfolio, type ScanResult } from "./lib/api";
import { AGENTS, agentMeta } from "./lib/agents";

type Ticker = { symbol: string; price: number | null; ok: boolean };
type BacktestSummary = Record<string, unknown>;

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const NAV = [
  ["⌂", "War Room"], ["◉", "Markets"], ["⌁", "Council"],
  ["▤", "Risk & Portfolio"], ["◷", "Backtest"],
];
const money = (n?: number) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const stamp = (n?: number) => n ? new Date(n).toLocaleTimeString() : "—";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [backtest, setBacktest] = useState<BacktestSummary | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<number>();
  const [activeNav, setActiveNav] = useState("War Room");

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([api.health(), api.portfolio(), api.ticker(SYMBOLS)]);
    const [h, p, t] = results;
    if (h.status === "fulfilled") setHealth(h.value);
    if (p.status === "fulfilled") setPortfolio(p.value);
    if (t.status === "fulfilled") setTickers(t.value.tickers);
    const failures = results.filter(r => r.status === "rejected");
    if (failures.length) setError("Some backend data could not be refreshed. Unavailable values are shown as —.");
    else setError("");
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
    try {
      await api.councilTick();
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Council tick failed"); }
    finally { setBusy(""); }
  };
  const runBacktest = async () => {
    setBusy("backtest"); setError("");
    try {
      const result = await api.backtest(symbol);
      setBacktest(result && typeof result === "object" ? result as BacktestSummary : { result });
    } catch (e) { setError(e instanceof Error ? e.message : "Backtest request failed"); }
    finally { setBusy(""); }
  };

  const reports = useMemo(() => scan?.reports ?? [], [scan]);
  const reportByAgent = (id: string) => reports.find(r => r.agent === id);
  const isHealthy = health?.overall?.toLowerCase() === "ok" || health?.overall?.toLowerCase() === "healthy";

  return <div className="warroom">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">A</span><span>APEX <span style={{ color: "#49e3ef" }}>AI</span> TRADE WAR ROOM</span></div>
      <div className="topbar-right"><span className="badge"><i className="live-dot" style={{ background: isHealthy ? "#52e0a1" : "#ffc66d" }} />{health ? (isHealthy ? "API ONLINE" : health.overall.toUpperCase()) : "API UNKNOWN"}</span><span className="mode-badge">{health?.modeDefault ?? "MODE UNKNOWN"}</span><span className="badge hide-mobile">Updated {stamp(updated)}</span></div>
    </header>
    <div className="layout">
      <aside className="sidebar"><div className="nav-label">Workspace</div>{NAV.map(([icon, name]) => <button key={name} className={`nav-item ${activeNav === name ? "active" : ""}`} onClick={() => setActiveNav(name)}><span className="nav-icon">{icon}</span>{name}</button>)}<div className="nav-label" style={{ marginTop: 26 }}>Execution</div><div className="agent-row"><span className="agent-avatar">P</span><div className="agent-info"><div className="agent-name">Paper-first</div><div className="agent-role">No order controls here</div></div></div><p className="footer-note">Dashboard actions request analysis only. Live trading is not enabled from this UI.</p></aside>
      <main className="content">
        <div className="page-heading"><div><p className="eyebrow">Independent AI trading council · data-backed workspace</p><h1>{activeNav}</h1><p className="subhead">Live market snapshots, real scan reports, risk status, and recorded analysis—without invented metrics.</p></div><div className="row"><button className="btn secondary" onClick={() => void refresh()}>↻ Refresh</button></div></div>
        {error && <div className="error-box" role="alert">{error}</div>}
        <section className="grid kpi-grid">
          <Kpi label="Account equity" value={money(portfolio?.equity)} foot={portfolio ? `${portfolio.mode} · API-reported` : "Waiting for API"} />
          <Kpi label="Available balance" value={money(portfolio?.available)} foot={portfolio ? `As of ${stamp(portfolio.timestamp)}` : "Not available"} />
          <Kpi label="Daily P&L" value={money(portfolio?.dailyPnl)} foot="Backend portfolio value" tone={portfolio?.dailyPnl == null ? "unknown" : portfolio.dailyPnl >= 0 ? "positive" : "negative"} />
          <Kpi label="Open positions" value={portfolio ? String(portfolio.openPositions) : "—"} foot={portfolio ? `${portfolio.consecutiveLosses} consecutive losses` : "Not available"} />
        </section>
        <section className="grid main-grid">
          <div className="grid">
            <section className="panel">
              <div className="panel-head"><div><h2 className="panel-title">Market scanner</h2><div className="panel-subtitle">Public ticker snapshot · refreshed every 15 seconds</div></div><span className="status-pill">{tickers.length ? `${tickers.filter(t => t.ok).length}/${tickers.length} FEEDS` : "NO FEED"}</span></div>
              <div className="table-wrap"><table className="data-table"><thead><tr><th>Market</th><th>Last price</th><th>Feed</th></tr></thead><tbody>{tickers.length ? tickers.map(t => <tr key={t.symbol}><td><strong>{t.symbol.replace("USDT", "")}</strong> / USDT</td><td>{t.price == null ? "—" : money(t.price)}</td><td className={t.ok ? "positive" : "negative"}>{t.ok ? "Connected" : "Unavailable"}</td></tr>) : <tr><td colSpan={3} className="unknown">No ticker data received from the API.</td></tr>}</tbody></table></div>
            </section>
            <section className="panel">
              <div className="panel-head"><div><h2 className="panel-title">Signal analysis</h2><div className="panel-subtitle">Each discussion entry below is taken from an actual scan response</div></div><span className="status-pill">{scan ? `SCAN ${scan.candidate?.status ?? "NO CANDIDATE"}` : "NO SCAN YET"}</span></div>
              <div className="control-row"><select aria-label="Symbol" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Timeframe" value={timeframe} onChange={e => setTimeframe(e.target.value)}>{["5m", "15m", "1h", "4h"].map(x => <option key={x}>{x}</option>)}</select><button className="btn" disabled={!!busy} onClick={() => void runScan()}>{busy === "scan" ? "Scanning…" : "Run scan"}</button><button className="btn secondary" disabled={!!busy} onClick={() => void runCouncil()}>{busy === "council" ? "Running…" : "Council tick"}</button></div>
              {scan?.candidate ? <div className="signal"><div className="signal-top"><span className="signal-symbol">{scan.candidate.symbol} · {scan.candidate.side}</span><span className="status-pill">{scan.candidate.status}</span></div><div className="signal-detail">Strategy scan · {scan.candidate.timeframe} · Entry {scan.candidate.entry} · Stop {scan.candidate.stopLoss} · Target {scan.candidate.takeProfit} · R:R {Number(scan.candidate.rewardRisk).toFixed(2)}<br />Risk engine: <b className={scan.riskAllowed ? "positive" : "negative"}>{scan.riskAllowed ? "Allowed by current checks" : "Rejected"}</b>{scan.riskReasons?.length ? ` · ${scan.riskReasons.join("; ")}` : ""}</div></div> : scan ? <div className="empty">Scan returned no candidate. No trade setup is being displayed as active.</div> : <div className="empty">Run a scan to populate this room with actual agent reports.</div>}
              {scan?.decision && <div className="message" style={{ borderColor: scan.decision.decision === "REJECT" ? "#ff7185" : "#49e3ef" }}><div className="message-meta"><span>CHIEF COORDINATION</span><span>{stamp(scan.decision.timestamp)}</span></div><div className="message-body"><b>{scan.decision.decision}</b> — {scan.decision.rationale}</div></div>}
              {reports.length > 0 && <div style={{ marginTop: 12 }}>{reports.map((r, i) => <Report key={`${r.agent}-${i}`} report={r} />)}</div>}
            </section>
          </div>
          <div className="grid" style={{ alignContent: "start" }}>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Council status</h2><div className="panel-subtitle">Waiting for live report data</div></div></div><div className="agent-list">{AGENTS.map(agent => { const report = reportByAgent(agent.id); return <div className="agent-row" key={agent.id}><span className="agent-avatar">{agent.initial}</span><div className="agent-info"><div className="agent-name">{agent.name}</div><div className="agent-role">{agent.role}</div></div><span className="status-pill">{report ? (report.advisoryVeto ? "VETO" : report.ok === false ? "ERROR" : "REPORTED") : "AWAITING"}</span></div>; })}</div><p className="footer-note">The UI does not generate agent opinions. If an agent has not returned a report, its status remains awaiting.</p></section>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Risk guardrails</h2><div className="panel-subtitle">Portfolio state reported by API</div></div></div><div className="signal-detail">Execution mode <b>{portfolio?.mode ?? "Unknown"}</b><br />Circuit breaker <b className={portfolio?.circuitBreakerActive ? "negative" : portfolio ? "positive" : "unknown"}>{portfolio ? portfolio.circuitBreakerActive ? "ACTIVE" : "Clear" : "Unknown"}</b><br />Kill switch <b className={portfolio?.killSwitchActive ? "negative" : portfolio ? "positive" : "unknown"}>{portfolio ? portfolio.killSwitchActive ? "ACTIVE" : "Clear" : "Unknown"}</b><br />Weekly P&amp;L <b>{money(portfolio?.weeklyPnl)}</b></div></section>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Strategy validation</h2><div className="panel-subtitle">Backtest only · not a promise of future performance</div></div></div><button className="btn secondary" disabled={!!busy} onClick={() => void runBacktest()}>{busy === "backtest" ? "Testing…" : `Run ${symbol} backtest`}</button>{backtest ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#a9bacd", fontSize: 10, marginTop: 12 }}>{JSON.stringify(backtest, null, 2)}</pre> : <p className="footer-note">No backtest result loaded yet. Performance metrics are not fabricated.</p>}</section>
          </div>
        </section>
        <p className="footer-note">Data is sourced from this project’s configured API. A working API connection is required for market and portfolio values. This dashboard does not submit live orders.</p>
      </main>
    </div>
  </div>;
}

function Kpi({ label, value, foot, tone = "" }: { label: string; value: string; foot: string; tone?: string }) {
  return <div className="panel"><div className="kpi-label">{label}</div><div className={`kpi-value ${tone}`}>{value}</div><div className="kpi-foot">{foot}</div></div>;
}

function Report({ report }: { report: AgentReport }) {
  const meta = agentMeta(report.agent);
  return <div className="message" style={{ borderColor: report.advisoryVeto ? "#ffc66d" : undefined }}><div className="message-meta"><span>{meta.name.toUpperCase()}{report.confidence != null ? ` · ${report.confidence}%` : ""}</span><span>{report.latencyMs != null ? `${report.latencyMs}ms` : ""}</span></div><div className="message-body">{report.summary}{report.objections?.length ? <div className="negative" style={{ marginTop: 5 }}>Objections: {report.objections.join("; ")}</div> : null}</div></div>;
}
