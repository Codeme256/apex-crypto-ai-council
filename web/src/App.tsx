import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";
import { api, type Candle, type CandleResponse, type Health, type BinanceConnectionStatus, type BinanceTestnetAccount, type CouncilReport } from "./lib/api";
import { TRADABLE, paperOrder, paperEquity, loadPaper, storePaper, type PaperState } from "./lib/paper-trading";

const SYMBOLS = [...TRADABLE];
const MEMES = new Set(["DOGEUSDT","SHIBUSDT","PEPEUSDT","BONKUSDT","FLOKIUSDT"]);
const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];
const fmt = (n?: number | null) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const time = (n?: number) => n ? new Date(n).toLocaleTimeString() : "—";

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tickers, setTickers] = useState<Array<{ symbol: string; price: number | null; ok: boolean; source?: string; timestamp?: number }>>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [feed, setFeed] = useState("Connecting");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<number>();
  const [category,setCategory] = useState<"ALL"|"MEME">("ALL");
  const [paper,setPaper] = useState<PaperState>(()=>loadPaper());
  const [orderUSDT,setOrderUSDT] = useState("25");
  const [tradeNotice,setTradeNotice] = useState("");
  const [binanceStatus,setBinanceStatus] = useState<BinanceConnectionStatus|null>(null);
  const [binanceAccount,setBinanceAccount] = useState<BinanceTestnetAccount|null>(null);
  const [accountMessage,setAccountMessage] = useState("");
  const [checkingAccount,setCheckingAccount] = useState(false);
  const [council,setCouncil] = useState<CouncilReport|null>(null);
  const [councilBusy,setCouncilBusy] = useState(false);
  const [councilError,setCouncilError] = useState("");
  const [councilUpdated,setCouncilUpdated] = useState<number|null>(null);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([api.health(), api.ticker(SYMBOLS)]);
    if (results[0].status === "fulfilled") setHealth(results[0].value);
    if (results[1].status === "fulfilled") setTickers(results[1].value.tickers);
    setUpdated(Date.now());
    setFeed(results[0].status === "fulfilled" && results[1].status === "fulfilled" && results[1].value.tickers.some(t => t.ok) ? "Verified public quote available" : "Live quotes unavailable");
  }, []);

  useEffect(()=>{storePaper(paper);},[paper]);
  useEffect(()=>{
    void api.binanceStatus().then(setBinanceStatus).catch(()=>setBinanceStatus(null));
  },[]);
  const checkBinance=async()=>{
    setCheckingAccount(true);setAccountMessage("");
    try{
      const account=await api.binanceAccount();
      setBinanceAccount(account);
      setAccountMessage("Binance Spot TESTNET account authenticated. This does not enable trading orders.");
    }catch(e){
      setBinanceAccount(null);
      setAccountMessage(e instanceof Error?e.message:"Testnet connection unavailable");
    }finally{setCheckingAccount(false);}
  };
  const prices=Object.fromEntries(tickers.filter(t=>t.ok&&t.price!==null).map(t=>[t.symbol,t.price!]));
  const equity=paperEquity(paper,prices);
  const currentQuote=tickers.find(t=>t.symbol===symbol&&t.ok&&t.price!==null);
  const todaysPaperTrades=paper.trades.filter(t=>new Date(t.at).toISOString().slice(0,10)===new Date().toISOString().slice(0,10));
  const submitPaper=(side:"BUY"|"SELL")=>{
    setTradeNotice("");
    try{
      if(!currentQuote||currentQuote.price===null||!currentQuote.timestamp||!currentQuote.source)throw Error("Wait for an available market quote");
      const next=paperOrder(paper,symbol,side,Number(orderUSDT),{
       price:currentQuote.price,timestamp:currentQuote.timestamp,source:currentQuote.source,
      },prices);
      setPaper(next);storePaper(next);
      setTradeNotice("SIMULATED "+side+" saved locally. No Binance order was placed.");
    }catch(e){setTradeNotice(e instanceof Error?e.message:"Order rejected");}
  };
  const runCouncil = useCallback(async()=>{
    setCouncilBusy(true);setCouncilError("");
    try{
      const report=await api.council(symbol,interval);
      setCouncil(report);setCouncilUpdated(Date.now());
    }catch(e){
      setCouncil(null);setCouncilError(e instanceof Error?e.message:"Market evidence unavailable");
    }finally{setCouncilBusy(false);}
  },[symbol,interval]);
  useEffect(()=>{
    void runCouncil();
    const timer=window.setInterval(()=>void runCouncil(),60_000);
    return ()=>window.clearInterval(timer);
  },[runCouncil]);
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
  const marketDataHealthy = healthy && tickers.some(t=>t.ok&&t.price!==null) && candles.length>0;
  const caps = health?.capabilities;

  return <div className="warroom">
    <div className="neural-overlay" aria-hidden="true"><span className="neural-node node-a" /><span className="neural-node node-b" /><span className="neural-node node-c" /><span className="neural-node node-d" /><span className="neural-node node-e" /></div>
    <header className="topbar"><div className="brand"><span className="brand-mark">A</span><span>APEX <span style={{ color: "#49e3ef" }}>AI</span> TRADE WAR ROOM</span></div><div className="topbar-right"><span className="badge"><i className="live-dot" style={{ background: marketDataHealthy ? "#52e0a1" : "#ffc66d" }} />{!health ? "API UNKNOWN" : marketDataHealthy ? "MARKET FEED ONLINE" : "MARKET FEED DEGRADED"}</span><span className="mode-badge">PAPER DESK</span><span className="badge hide-mobile">Updated {time(updated)}</span></div></header>
    <div className="layout"><aside className="sidebar"><div className="nav-label">Workspace</div><div className="nav-item active"><span className="nav-icon">⌂</span>War Room</div><a className="nav-item" href="#markets"><span className="nav-icon">◉</span>Markets</a>
      <a className="nav-item" href="#paper-desk"><span className="nav-icon">↗</span>Paper Trading</a>
      <a className="nav-item" href="#meme-markets"><span className="nav-icon">◆</span>Meme Coins</a><a className="nav-item" href="#ai-council"><span className="nav-icon">⌁</span>AI Council <span className="status-pill">{councilBusy?"ANALYZING":council?"EVIDENCE READY":"NO DATA"}</span></a><div className="nav-label" style={{ marginTop: 26 }}>Execution</div><div className="agent-row"><span className="agent-avatar">P</span><div className="agent-info"><div className="agent-name">Paper Trading</div><div className="agent-role">Virtual USDT · browser wallet</div></div></div><p className="footer-note">Simulated trades are enabled. Binance account orders remain locked until a protected testnet connection and risk system are configured.</p></aside>
      <main className="content"><div className="page-heading"><div><p className="eyebrow">Public market data · paper trading enabled</p><h1>Trading War Room</h1><p className="subhead">Simulate Spot trades with a locally saved paper wallet. Market quotes retain their exchange-source labels; no real orders are submitted.</p></div><div className="row"><button className="btn secondary" onClick={() => void refresh()}>↻ Refresh</button></div></div>
        {error && <div className="error-box" role="alert">Market feed: {error}</div>}
        <section id="paper-desk" className="panel" style={{marginTop:0,marginBottom:16}}>
          <div className="panel-head"><div><h2 className="panel-title">Spot Paper Trading Desk</h2>
          <div className="panel-subtitle">Virtual 10,000 USDT starting balance · saved in this browser only</div></div>
          <span className="status-pill">{paper.killSwitch?"PAPER HALTED":"PAPER ACTIVE"}</span></div>
          <div className="paper-stats">
           <Kpi label="Paper cash" value={fmt(paper.cash)+" USDT"} foot="Virtual, not exchange funds"/>
           <Kpi label="Estimated equity" value={fmt(equity)+" USDT"} foot="Marks to available public quotes"/>
           <Kpi label="Today's orders" value={String(todaysPaperTrades.length)+"/6"} foot="UTC day · client-side limit"/>
           <Kpi label="Open holdings" value={String(Object.keys(paper.positions).length)} foot="Spot long-only"/>
          </div>
          <div className="paper-trade-row">
           <div><label htmlFor="paper-size" className="kpi-label">Order value · USDT</label>
           <input id="paper-size" type="number" min="5" step="1" value={orderUSDT}
             onChange={e=>setOrderUSDT(e.target.value)} placeholder="25" /></div>
           <div className="signal-detail">Market: <b>{symbol}</b>
             <br/>Quote: <b>{currentQuote?.price==null?"Unavailable":fmt(currentQuote.price)}</b>
             <br/>Source: <b>{currentQuote?.source??"Waiting for feed"}</b>
           </div>
           <button className="btn buy" disabled={paper.killSwitch||!currentQuote} onClick={()=>submitPaper("BUY")}>Simulate BUY</button>
           <button className="btn sell" disabled={paper.killSwitch||!currentQuote} onClick={()=>submitPaper("SELL")}>Simulate SELL</button>
          </div>
          {tradeNotice&&<p className="paper-notice" role="status">{tradeNotice}</p>}
          <div className="paper-columns">
            <div><h3 className="panel-title">Paper holdings</h3><div className="table-wrap"><table className="data-table">
             <thead><tr><th>Symbol</th><th>Qty</th><th>Cost (USDT)</th></tr></thead>
             <tbody>{Object.entries(paper.positions).length?Object.entries(paper.positions).map(([name,pos])=>
               <tr key={name}><td>{name}</td><td>{fmt(pos.qty)}</td><td>{fmt(pos.cost)}</td></tr>):
               <tr><td colSpan={3} className="unknown">No simulated holdings</td></tr>}</tbody>
            </table></div></div>
            <div><h3 className="panel-title">Recent paper transactions</h3><div className="table-wrap"><table className="data-table">
             <thead><tr><th>Side</th><th>Symbol</th><th>USDT</th><th>Time</th></tr></thead>
             <tbody>{paper.trades.length?paper.trades.slice(0,8).map(t=>
               <tr key={t.id}><td className={t.side==="BUY"?"positive":"negative"}>{t.side}</td><td>{t.symbol}</td>
               <td>{fmt(t.gross)}</td><td>{time(t.at)}</td></tr>):
               <tr><td colSpan={4} className="unknown">No paper orders recorded</td></tr>}</tbody>
            </table></div></div>
          </div>
          <p className="footer-note">Paper prices are indicative exchange data, not executable quotes. Simulated fees are included; slippage, funding, tax and exchange fills are not. Clearing browser data resets this wallet.</p>
        </section>
        <section className="grid kpi-grid"><Kpi label="Selected market" value={symbol} foot={currentQuote?.source ?? "Exchange source unavailable"} /><Kpi label="Latest close" value={fmt(latest?.close)} foot={latest ? `${interval} candle · ${latest.closed ? "closed" : "forming"}` : "No candle loaded"} /><Kpi label="Latest volume" value={fmt(latest?.volume)} foot={latest ? `Candle time ${new Date(latest.time * 1000).toLocaleString()}` : "Unavailable"} /><Kpi label="Trading mode" value="PAPER" foot="No exchange orders or real funds" /></section>
        <section className="grid main-grid"><div className="grid"><section id="markets" className="panel chart-panel"><div className="panel-head"><div><h2 className="panel-title">Live market chart</h2><div className="panel-subtitle">{feed} · candles from Cloudflare Pages API</div></div><div className="chart-controls">
          <select aria-label="Market group" value={category} onChange={e=>{const next=e.target.value as "ALL"|"MEME";setCategory(next);if(next==="MEME"&&!MEMES.has(symbol))setSymbol("DOGEUSDT");}}>
          <option value="ALL">All crypto</option><option value="MEME">Meme coins</option></select>
          <select aria-label="Trading pair" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.filter(s=>category==="ALL"||MEMES.has(s)).map(s => <option key={s}>{s}</option>)}</select><select aria-label="Candle interval" value={interval} onChange={e => setInterval(e.target.value)}>{INTERVALS.map(x => <option key={x}>{x}</option>)}</select></div></div><div ref={host} className="chart-host" /><div className="chart-note">Historical candles fetched from the Cloudflare Pages Function. The chart does not imply a signal or recommendation.</div></section>
          <section id="meme-markets" className="panel"><div className="panel-head"><div><h2 className="panel-title">Crypto and meme markets</h2><div className="panel-subtitle">Public exchange prices · unavailable symbols never get invented quotes</div></div><span className="status-pill">{tickers.length ? `${tickers.filter(t => t.ok).length}/${tickers.length} AVAILABLE` : "NO FEED"}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Market</th><th>Last price</th><th>Exchange / status</th><th>Source time</th></tr></thead><tbody>{tickers.length ? tickers.map(t => <tr key={t.symbol}><td><strong>{t.symbol}</strong></td><td>{t.ok ? fmt(t.price) : "—"}</td><td className={t.ok ? "positive" : "negative"}>{t.ok ? t.source ?? "Unspecified exchange" : "Unavailable"}</td><td>{time(t.timestamp)}</td></tr>) : <tr><td colSpan={4} className="unknown">Waiting for ticker API response.</td></tr>}</tbody></table></div></section></div>
          <div className="grid" style={{ alignContent: "start" }}><section className="panel"><div className="panel-head"><div><h2 className="panel-title">System capabilities</h2><div className="panel-subtitle">Backend-reported status only</div></div></div><Capability name="Public market data" enabled={caps?.publicMarketData} /><Capability name="Evidence-based council agents" enabled={Boolean(council)} /><Capability name="Binance account connection" enabled={Boolean(binanceAccount)} /><Capability name="Browser paper simulation" enabled={true} /><Capability name="Live execution" enabled={caps?.liveExecution} /><p className="footer-note">Paper trading operates locally in this browser; the backend does not store or execute those simulated positions.</p></section>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Council status</h2><div className="panel-subtitle">Real data evidence, not generated chat</div></div></div><div className="signal-detail">Current symbol <b>{council?.symbol??symbol}</b><br/>Evidence state <b className={council?"positive":"unknown"}>{councilBusy?"ANALYZING":council?"AVAILABLE":"UNAVAILABLE"}</b><br/>Council verdict <b>{council?.verdict??"WAIT"}</b><br/>Execution permission <b className="negative">BLOCKED</b></div><p className="footer-note">Technical agents run server-side. This is deterministic analysis, not an external LLM or an autonomous trader.</p></section>
            <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Paper risk controls</h2><div className="panel-subtitle">Simulated orders only</div></div></div>
          <div className="signal-detail">Paper kill switch <b className={paper.killSwitch?"negative":"positive"}>{paper.killSwitch?"ACTIVE":"OFF"}</b>
          <br/>Per-order limit <b>5% of paper equity</b><br/>Daily trade limit <b>6 orders</b>
          <br/>Realized loss cap <b>2% of initial virtual balance</b><br/>Estimated fee <b>0.1% per side</b>
          <br/>Leverage and short selling <b>Disabled</b></div>
          <button className="btn secondary" style={{marginTop:12}} onClick={()=>setPaper(p=>({...p,killSwitch:!p.killSwitch}))}>{paper.killSwitch?"Enable paper orders":"Stop all paper orders"}</button>
          <p className="footer-note">These client-side limits are not broker-level protections. Real-money trading remains disabled.</p>
          </section></div></section>
        <section id="ai-council" className="panel council-section" style={{marginTop:16}}>
          <div className="panel-head"><div><h2 className="panel-title">APEX Market Evidence Council</h2>
            <div className="panel-subtitle">6 independent rule-based agents · verified exchange candles · 60-second refresh</div></div>
            <button className="btn secondary" onClick={()=>void runCouncil()} disabled={councilBusy}>
              {councilBusy?"Analyzing market...":"Run new analysis"}
            </button>
          </div>
          <div className="council-meta">
            <span className="status-pill">{councilBusy?"RUNNING":council?"COMPLETED":"AWAITING EVIDENCE"}</span>
            <span className="status-pill">{council?.symbol??symbol} · {council?.timeframe??interval}</span>
            <span className="status-pill">VERDICT: {council?.verdict??"NO DATA"}</span>
            <span className="status-pill">ORDER EXECUTION: DISABLED</span>
          </div>
          {councilError&&<div role="alert" className="error-box">Evidence council unavailable: {councilError}. No output has been fabricated.</div>}
          {!council&&councilBusy&&<p className="council-wait">Retrieving completed exchange candles and verified quotes before agents calculate their independent findings...</p>}
          {council&&<>
            <p className="council-source">Evidence: {council.source} · {council.dataPoints} closed candles · 
            Last closed: {new Date(council.lastCandleTime).toLocaleString()} · 
            Analyzed: {new Date(council.asOf).toLocaleString()} {councilUpdated?"· Last response "+new Date(councilUpdated).toLocaleTimeString():""}</p>
            <div className="council-indicators">
              <div><span>EMA20</span><strong>{fmt(council.indicators.ema20)}</strong></div>
              <div><span>EMA50</span><strong>{fmt(council.indicators.ema50)}</strong></div>
              <div><span>RSI14</span><strong>{council.indicators.rsi14.toFixed(1)}</strong></div>
              <div><span>ATR14</span><strong>{fmt(council.indicators.atr14)}</strong></div>
              <div><span>Volume / Avg</span><strong>{council.indicators.volumeRatio.toFixed(2)}x</strong></div>
            </div>
            <div className="council-agents">
              {council.agents.map((agent,index)=><article key={agent.id} className={"council-agent "+(councilBusy?"council-agent-busy":"")}>
                <div className="council-agent-head"><span className="council-agent-avatar">{index+1}</span>
                <div><strong>{agent.id}</strong><p>{agent.role}</p></div>
                <span className={"status-pill "+(agent.assessment==="VETO"?"council-veto":"")}>
                  {councilBusy?"UPDATING":agent.state==="BLOCKED"?"BLOCKED":agent.assessment}
                </span></div>
                <p>{agent.summary}</p>
                <ul>{agent.observations.map((item,i)=><li key={i}>{item}</li>)}</ul>
              </article>)}
            </div>
            {council.blockers.length>0&&<div className="council-blockers"><strong>Execution blockers · advisory only</strong>
              <ul>{council.blockers.map((reason,i)=><li key={i}>{reason}</li>)}</ul>
            </div>}
          </>}
          <p className="footer-note">These agents are independent deterministic scanners, not self-learning LLMs. No exchange orders are submitted; no win rate or trading edge is claimed. Values are calculated from source-labelled candles. The skeptic and risk agents veto execution when critical market information is missing.</p>
        </section>
        <section className="panel" style={{marginTop:16}}>
          <div className="panel-head"><div><h2 className="panel-title">Connect Binance Spot Testnet</h2>
          <div className="panel-subtitle">Protected account access · virtual funds only</div></div>
          <span className="status-pill">{binanceAccount?"TESTNET CONNECTED":"ACCOUNT NOT CONNECTED"}</span></div>
          <div className="signal-detail">Testnet credentials: <b>{binanceStatus?.credentialsConfigured?"Configured":"Not configured"}</b>
          <br/>Cloudflare Access verification: <b>{binanceStatus?.accessProtectionConfigured?"Configured":"Not configured"}</b>
          <br/>Live exchange orders: <b>DISABLED</b></div>
          <button className="btn" style={{marginTop:12}} disabled={checkingAccount}
             onClick={()=>void checkBinance()}>{checkingAccount?"Checking account...":"Check Binance Testnet connection"}</button>
          {accountMessage&&<p className="paper-notice" role="status">{accountMessage}</p>}
          {binanceAccount&&<div className="table-wrap"><table className="data-table"><thead>
             <tr><th>Asset</th><th>Available (virtual)</th><th>Locked</th></tr></thead><tbody>
             {binanceAccount.balances.map(x=><tr key={x.asset}><td>{x.asset}</td><td>{x.free}</td><td>{x.locked}</td></tr>)}
             </tbody></table></div>}
          <p className="footer-note">To connect, configure a dedicated Binance SPOT TESTNET key as Cloudflare Pages secrets and protect the account endpoints with Cloudflare Access. Do not enter Binance keys into this website or chat. No real funds or live orders are accessible through this connection.</p>
        </section>
        <p className="footer-note">Market prices can change rapidly. Public feed availability is not guaranteed. Informational display only, not investment advice.</p>
      </main></div></div>;
}

function Kpi({ label, value, foot }: { label: string; value: string; foot: string }) { return <div className="panel"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-foot">{foot}</div></div>; }
function Capability({ name, enabled }: { name: string; enabled?: boolean }) { return <div className="agent-row"><span className="agent-avatar" style={{ color: enabled ? "#52e0a1" : "#ffc66d" }}>{enabled ? "✓" : "—"}</span><div className="agent-info"><div className="agent-name">{name}</div></div><span className="status-pill">{enabled === undefined ? "UNKNOWN" : enabled ? "AVAILABLE" : "NOT CONNECTED"}</span></div>; }
