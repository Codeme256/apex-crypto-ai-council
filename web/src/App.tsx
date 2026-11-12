import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";
import { api, type Candle, type CandleResponse, type Health } from "./lib/api";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];
const fmt = (n?: number | null) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const time = (n?: number) => n ? new Date(n).toLocaleTimeString() : "—";

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tickers, setTickers] = useState<Array<{ symbol: string; price: number | null; ok: boolean; timestamp?: number }>>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [feed, setFeed] = useState("Connecting");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<number>();

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([api.health(), api.ticker(SYMBOLS)]);
    if (results[0].status === "fulfilled") setHealth(results[0].value);
    if (results[1].status === "fulfilled") setTickers(results[1].value.tickers);
    setUpdated(Date.now());
    setFeed(results[0].status === "fulfilled" && results[1].status === "fulfilled" ? "API connected" : "API data unavailable");
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      height: 340,
      layout: { background: { color: "#0b121d" }, textColor: "#98a8bd", fontFamily: "Manrope, sans-serif" },
      grid: { vertLines: { color: "#172232" }, horzLines: { color: "#172232" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#233247" },
      timeScale: { borderColor: "#233247", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({ upColor: "#52e0a1", downColor: "#ff7185", borderVisible: false, wickUpColor: "#52e0a1", wickDownColor: "#ff7185" });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    setFeed("Loading candles");
    api.candles(symbol, interval, 300).then((result: CandleResponse) => {
      if (!active) return;
      const valid = result.candles.filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite));
      setCandles(valid);
      seriesRef.current?.setData(valid.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }) as CandlestickData<Time>[][number]));
      chartRef.current?.timeScale().fitContent();
      setFeed(`${result.source} · updated ${time(result.retrievedAt)}`);
    }).catch(e => {
      if (!active) return;
      setCandles([]);
      seriesRef.current?.setData([]);
      setFeed("Candle data unavailable");
      setError(e instanceof Error ? e.message : "Unable to load candle data");
    });
    return () => { active = false; };
  }, [symbol, interval]);

  const latest = candles.at(-1);
  const healthy = health?.overall?.toLowerCase() === "healthy" || health?.overall?.toLowerCase() === "ok";
  const caps = health?.capabilities;

  return <div className="warroom">
    <div className="neural-overlay" aria-hidden="true"><span className="neural-node node-a" /><span className="neural-node node-b" /><span className="neural-node node-c" /><span className="neural-node node-d" /><span className="neural-node node-e" /></div>
    <header className="topbar"><div className="brand"><span className="brand-mark">A</span><span>APEX <span style={{ color: "#49e3ef" }}>AI</span> TRADE WAR ROOM</span></div><div className="topbar-right"><span className="badge"><i className="live-dot" style={{ background: healthy ? "#52e0a1" : "#ffc66d" }} />{health ? healthy ? "API ONLINE" : health.overall.toUpperCase() : "API UNKNOWN"}</span><span className="mode-badge">{health?.modeDefault ?? "MODE UNKNOWN"}</span><span className="badge hide-mobile">Updated {time(updated)}</span></div></header>
    <div className="layout"><aside className="sidebar"><div className="nav-label">Workspace</div><div className="nav-item active"><span className="nav-icon">⌂</span>War Room</div><div className="nav-item"><span className="nav-icon">◉</span>Markets</div><div className="nav-item"><span className="nav-icon">⌁</span>Agents <span className="status-pill">{caps?.agents ? "ON" : "NOT CONNECTED"}</span></div><div className="nav-label" style={{ marginTop: 26 }}>Execution</div><div className="agent-row"><span className="agent-avatar">R</span><div className="agent-info"><div className="agent-name">Read-only mode</div><div className="agent-role">No live order access</div></div></div><p className="footer-note">Live trading is not available in this market-data-only phase.</p></aside>
      <main className="content"><div className="page-heading"><div><p className="eyebrow">Market data · read-only connection</p><h1>Trading War Room</h1><p className="subhead">Neural motion is decorative. Candles and tickers are fetched from public market data.</p></div><div className="row"><button className="btn secondary" onClick={() => void refresh()}>↻ Refresh</button></div></div>
        {error && <div className="error-box" role="alert">Market feed: {error}</div>}
        <section className="grid kpi-grid"><Kpi label="Selected market" value={symbol} foot="Binance Spot public market data" /><Kpi label="Latest close" value={fmt(latest?.close)} foot={latest ? `${interval} candle · ${latest.closed ? "closed" : "forming"}` : "No candle loaded"} /><Kpi label="Latest volume" value={fmt(latest?.volume)} foot={latest ? `Candle time ${new Date(latest.time * 1000).toLocaleString()}` : "Unavailable"} /><Kpi label="Trading mode" value="READ ONLY" foot="Order submission disabled" /></section>
        <section className="grid main-grid"><div className="grid"><section className="panel chart-panel"><div className="panel-head"><div><h2 className="panel-title">Live market chart</h2><div className="panel-subtitle">{feed} · candles from Cloudflare Pages API</div></div><div className="chart-controls"><select aria-label="Trading pair" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Candle interval" value={interval} onChange={e => setInterval(e.target.value)}>{INTERVALS.map(x => <option key={x}>{x}</option>)}</select></div></div><div ref={host} className="chart-host" /><div className="chart-note">Historical candles fetched from the Cloudflare Pages Function. The chart does not imply a signal or recommendation.</div></section>
          <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Market scanner</h2><div className="panel-subtitle">Public ticker snapshots</div></div><span className="status-pill">{tickers.length ? `${tickers.filter(t => t.ok).length}/${tickers.length} AVAILABLE` : "NO FEED"}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Market</th><th>Last price</th><th>Status</th><th>Source time</th></tr></thead><tbody>{tickers.length ? tickers.map(t => <tr key={t.symbol}><td><strong>{t.symbol}</strong></td><td>{t.ok ? fmt(t.price) : "—"}</td><td className={t.ok ? "positive" : "negative"}>{t.ok ? "Connected" : "Unavailable"}</td><td>{time(t.timestamp)}</td></tr>) : <tr><td colSpan={4} className="unknown">Waiting for ticker API response.</td></tr>}</tbody></table></div></section></div>
          <div className="grid" style={{ alignContent: "start" }}><section className="panel"><div className="panel-head"><div><h2 className="panel-title">System capabilities</h2><div className="panel-subtitle">Backend-reported status only</div></div></div><Capability name="Public market data" enabled={caps?.publicMarketData} /><Capability name="AI agents" enabled={caps?.agents} /><Capability name="Portfolio/account connection" enabled={caps?.portfolio} /><Capability name="Paper execution" enabled={caps?.paperExecution} /><Capability name="Live execution" enabled={caps?.liveExecution} /><p className="footer-note">Capabilities not yet implemented by the connected API are not represented as active features.</p></section>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Signal room</h2><div className="panel-subtitle">No fabricated agent messages</div></div></div><div className="empty">{caps?.agents ? "Agent reporting is configured; no scan report has been loaded." : "Agent services are not connected to this read-only API. No signal or AI debate is being generated."}</div></section>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Risk & execution</h2><div className="panel-subtitle">Trading actions unavailable</div></div></div><div className="signal-detail">Default mode <b>{health?.modeDefault ?? "Unknown"}</b><br />Kill switch <b className={health?.live.killSwitch ? "negative" : "unknown"}>{health ? health.live.killSwitch ? "ACTIVE" : "Clear" : "Unknown"}</b><br />Account equity <b>Unavailable</b><br />Paper fills <b>Unavailable</b></div><p className="footer-note">No account credentials are connected. This dashboard cannot place orders.</p></section></div></section>
        <p className="footer-note">Market prices can change rapidly. Public feed availability is not guaranteed. Informational display only, not investment advice.</p>
      </main></div></div>;
}

function Kpi({ label, value, foot }: { label: string; value: string; foot: string }) { return <div className="panel"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-foot">{foot}</div></div>; }
function Capability({ name, enabled }: { name: string; enabled?: boolean }) { return <div className="agent-row"><span className="agent-avatar" style={{ color: enabled ? "#52e0a1" : "#ffc66d" }}>{enabled ? "✓" : "—"}</span><div className="agent-info"><div className="agent-name">{name}</div></div><span className="status-pill">{enabled === undefined ? "UNKNOWN" : enabled ? "AVAILABLE" : "NOT CONNECTED"}</span></div>; }
