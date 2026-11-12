import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";
import { api, type CandleResponse, type Candle, type CouncilReport, type Health } from "./lib/api";
import "./styles/command-center.css";
import AccountWorkspace from "./AccountWorkspace";

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "BONKUSDT", "FLOKIUSDT"] as const;
const PERIODS = ["1m", "5m", "15m", "1h", "4h"] as const;
const AGENTS = [
  {id:"SCOUT",name:"Scout",work:"SCANNING",role:"Structure & opportunities",x:9,y:50,initial:"S"},
  {id:"TREND",name:"Trend",work:"ANALYZING",role:"EMA trend validation",x:32,y:17,initial:"T"},
  {id:"MOMENTUM",name:"Momentum",work:"ANALYZING",role:"RSI & trade volume",x:32,y:80,initial:"M"},
  {id:"NEWS",name:"News",work:"NOT CONNECTED",role:"No verified news source",x:32,y:49,initial:"N"},
  {id:"SKEPTIC",name:"Skeptic",work:"CHALLENGING",role:"Counterarguments",x:56,y:49,initial:"K"},
  {id:"COUNCIL",name:"Council",work:"DECIDING",role:"Final evidence synthesis",x:76,y:49,initial:"Σ"},
  {id:"RISK",name:"Risk",work:"GUARDING",role:"Hard trading restrictions",x:93,y:49,initial:"R"},
] as const;
type AgentId = (typeof AGENTS)[number]["id"];
const LINKS: [AgentId,AgentId][] = [
  ["SCOUT","TREND"],["SCOUT","NEWS"],["SCOUT","MOMENTUM"],
  ["TREND","SKEPTIC"],["MOMENTUM","SKEPTIC"],
  ["SKEPTIC","COUNCIL"],["COUNCIL","RISK"]
];
const COORDS = Object.fromEntries(AGENTS.map(a=>[a.id,a])) as Record<AgentId,(typeof AGENTS)[number]>;
const format=(n?:number|null)=>n==null||!Number.isFinite(n)?"—":n.toLocaleString(undefined,{maximumFractionDigits:4});
const clock=(n?:number|null)=>n?new Date(n).toLocaleTimeString():"—";

function LiveCandles({candles}:{candles:Candle[]}) {
  const mount=useRef<HTMLDivElement>(null);
  const chart=useRef<IChartApi|null>(null);
  const series=useRef<ISeriesApi<"Candlestick">|null>(null);
  useEffect(()=>{
    if(!mount.current)return;
    const c=createChart(mount.current,{
      autoSize:true,height:330,
      layout:{background:{color:"#0d1625"},textColor:"#9eb2c7",fontFamily:"Manrope, sans-serif"},
      grid:{vertLines:{color:"#1d2a3c"},horzLines:{color:"#1d2a3c"}},
      crosshair:{mode:CrosshairMode.Normal},
      rightPriceScale:{borderColor:"#27384b"},
      timeScale:{borderColor:"#27384b",timeVisible:true,secondsVisible:false}
    });
    chart.current=c;
    series.current=c.addCandlestickSeries({
      upColor:"#50e0b0",downColor:"#fc6c8e",borderVisible:false,
      wickUpColor:"#50e0b0",wickDownColor:"#fc6c8e"
    });
    return()=>{c.remove();chart.current=null;series.current=null};
  },[]);
  useEffect(()=>{
    const points=candles.filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite) &&
      x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close))
      .sort((a,b)=>a.time-b.time)
      .map(c=>({time:c.time as Time,open:c.open,high:c.high,low:c.low,close:c.close} as CandlestickData<Time>));
    // Exchange providers can return gaps or repeated timestamps; only distinct real timestamps are plotted.
    const seen=new Set<number>();
    const unique=points.filter(p=>{const n=Number(p.time);if(seen.has(n))return false;seen.add(n);return true});
    series.current?.setData(unique);
    if(unique.length)chart.current?.timeScale().fitContent();
  },[candles]);
  return <div className="cc-chart-area"><div ref={mount} className="cc-canvas" role="img" aria-label="Exchange candlestick chart"/>{candles.length===0&&<div className="cc-chart-empty">Verified candles unavailable. No synthetic prices are shown.</div>}</div>;
}

export default function CommandCenter() {
  const [symbol,setSymbol]=useState<string>("BTCUSDT");
  const [period,setPeriod]=useState<string>("15m");
  const [candles,setCandles]=useState<Candle[]>([]);
  const [source,setSource]=useState("");
  const [marketAt,setMarketAt]=useState<number|null>(null);
  const [health,setHealth]=useState<Health|null>(null);
  const [council,setCouncil]=useState<CouncilReport|null>(null);
  const [marketError,setMarketError]=useState("");
  const [councilError,setCouncilError]=useState("");
  const [updating,setUpdating]=useState(false);
  const [automatic,setAutomatic]=useState(true);
  const [version,setVersion]=useState(0);
  const requestRef=useRef<AbortController|null>(null);

  const refresh=useCallback(async()=>{
    if(requestRef.current)requestRef.current.abort();
    const controller=new AbortController();
    requestRef.current=controller;
    setUpdating(true);
    const [prices,assessment,status]=await Promise.allSettled([
      api.candles(symbol,period,180),api.council(symbol,period),api.health()
    ]);
    if(controller.signal.aborted)return;
    if(prices.status==="fulfilled"&&prices.value.symbol===symbol&&prices.value.interval===period){
      const result: CandleResponse=prices.value;
      const verified=result.candles.filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&
        c.time>0&&c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));
      setCandles(verified);
      setSource(result.source);
      setMarketAt(result.retrievedAt);
      setMarketError(verified.length?"":"The exchange returned no usable candles");
    }else{
      setCandles([]);setSource("");setMarketAt(null);
      setMarketError(prices.status==="rejected"?
        String(prices.reason instanceof Error?prices.reason.message:prices.reason):
        "Market symbol or timeframe mismatch");
    }
    if(assessment.status==="fulfilled"&&assessment.value.symbol===symbol){
      setCouncil(assessment.value);
      setCouncilError("");
    }else{
      setCouncil(null);
      setCouncilError(assessment.status==="rejected"?
        String(assessment.reason instanceof Error?assessment.reason.message:assessment.reason):
        "Council assessment is unavailable for this market");
    }
    setHealth(status.status==="fulfilled"?status.value:null);
    setUpdating(false);
    requestRef.current=null;
  },[symbol,period]);
  useEffect(()=>{
    if(!automatic)return;
    void refresh();
    const timer=window.setInterval(()=>{void refresh()},60000);
    return()=>{window.clearInterval(timer);requestRef.current?.abort();requestRef.current=null};
  },[refresh,automatic,version]);

  const last=candles.at(-1);
  const first=candles[0];
  const percentage=last&&first?((last.close-first.open)/first.open)*100:null;
  const byId=Object.fromEntries((council?.agents??[]).map(a=>[a.id,a])) as Record<string,CouncilReport["agents"][number]|undefined>;
  const feedVerified=Boolean(last&&source&&marketAt&&Date.now()-marketAt<120_000);
  const agentState=(id:AgentId)=>{
    if(id==="NEWS")return "NOT CONNECTED";
    if(updating)return AGENTS.find(a=>a.id===id)?.work??"CHECKING";
    if(byId[id])return byId[id]?.state==="BLOCKED"?"VETO":"REPORTED";
    return councilError?"UNAVAILABLE":"WAITING";
  };
  return <div className="cc-app">
    <header className="cc-header">
      <a className="cc-brand" href="/"><span className="cc-logo">A</span><span>APEX <em>AI</em> TRADE WAR ROOM</span></a>
      <div className="cc-top-tags">
        <span className={"cc-chip "+(feedVerified?"cc-good":"cc-warn")}><i className="cc-dot"/>{feedVerified?"VERIFIED MARKET":"FEED UNAVAILABLE"}</span>
        <span className="cc-chip cc-blue">PAPER / ADVISORY</span>
        <a className="cc-top-link" href="#account">My account &amp; paper desk ↗</a>
      </div>
    </header>
    <div className="cc-shell">
      <aside className="cc-sidebar">
        <p className="cc-menu-label">Command center</p>
        <a className="cc-menu cc-selected" href="#overview">▦ <span>Overview</span></a>
        <a className="cc-menu" href="#market">◉ <span>Live Markets</span></a>
        <a className="cc-menu" href="#arena">⬡ <span>AI Agents</span></a>
        <a className="cc-menu" href="#evidence">▤ <span>Agent Reports</span></a>
        <a className="cc-menu" href="#risk">⛨ <span>Risk Control</span></a>
        <p className="cc-menu-label">My workspace</p>
        <a className="cc-menu" href="#account">◫ <span>My Account</span></a>
        <a className="cc-menu" href="#paper-desk">⇄ <span>Paper Trading</span></a>
        <a className="cc-menu" href="#trade-history">▣ <span>Trade History</span></a>
        <a className="cc-menu" href="#binance-testnet">⌘ <span>Binance Testnet</span></a>
        <a className="cc-menu" href="#account">⇥ <span>My APEX Account</span></a>
        <p className="cc-sidebar-note">Connected to this site's existing Crypto Council API. Live-money order execution is disabled.</p>
      </aside>
      <main className="cc-main">
        <section id="overview" className="cc-intro">
          <div><div className="cc-eyebrow">VERIFIED EXCHANGE DATA · AUTOMATED EVIDENCE REVIEWS</div>
            <h1>AI Trading War Room</h1>
            <p>Watch the Council evaluate real market data. Agent activity reflects API requests; all findings are advisory, not live orders.</p>
          </div>
          <div className="cc-actions">
            <select value={symbol} aria-label="Trading pair" onChange={e=>setSymbol(e.target.value)}>{PAIRS.map(p=><option key={p} value={p}>{p}</option>)}</select>
            <select value={period} aria-label="Timeframe" onChange={e=>setPeriod(e.target.value)}>{PERIODS.map(p=><option key={p} value={p}>{p}</option>)}</select>
            <button type="button" disabled={updating} onClick={()=>setVersion(v=>v+1)}>{updating?"Checking…":"Refresh"}</button>
            <button type="button" className="cc-ghost" onClick={()=>setAutomatic(a=>!a)}>{automatic?"Pause":"Resume"}</button>
          </div>
        </section>
        <div className="cc-stat-grid">
          <article className="cc-stat"><span>Selected market</span><strong>{symbol.replace("USDT","/USDT")}</strong><small>{source||"Provider unavailable"}</small></article>
          <article className="cc-stat"><span>Last verified close</span><strong>{format(last?.close)}</strong><small>{percentage===null?"No candle data":(percentage>=0?"+":"")+percentage.toFixed(2)+"% in displayed window"}</small></article>
          <article className="cc-stat"><span>Council verdict</span><strong className={council?.verdict==="WATCH"?"cc-lime":"cc-amber"}>{council?.verdict??"UNAVAILABLE"}</strong><small>{council?.bias??"No verified assessment"} · no trades</small></article>
          <article className="cc-stat"><span>API status</span><strong>{health?.overall??"UNAVAILABLE"}</strong><small>{health?.modeDefault??"NO DATA"} · last update {clock(marketAt)}</small></article>
        </div>

        <section id="arena" className="cc-panel cc-arena-panel">
          <div className="cc-panel-head"><div><h2>AI Council Arena</h2><p>Animating actual API requests and displaying returned evidence.</p></div><span className="cc-chip">{updating?"REQUESTS IN PROGRESS":council?"REPORTS RECEIVED":"NO COUNCIL DATA"}</span></div>
          <div className="cc-arena">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="cc-connections" aria-hidden="true">
              {LINKS.map(([a,b])=><line key={a+b} x1={COORDS[a].x} y1={COORDS[a].y} x2={COORDS[b].x} y2={COORDS[b].y} strokeWidth={updating&&a!=="NEWS"&&b!=="NEWS"?0.5:0.2} stroke={updating&&a!=="NEWS"&&b!=="NEWS"?"#41dbe9":"#284356"} strokeDasharray={updating?"1.2 1.2":undefined}/>)}
            </svg>
            {AGENTS.map(a=>{
              const found=byId[a.id];
              const working=updating&&a.id!=="NEWS";
              return <div className={"cc-node "+(working?"cc-working ":"")+(found?.assessment==="VETO"?"cc-veto ":"")+(a.id==="NEWS"?"cc-offline":"")} key={a.id} style={{left:a.x+"%",top:a.y+"%"}}>
                <div className="cc-node-icon">{a.initial}</div>
                <b>{a.name}</b>
                <small>{agentState(a.id)}</small>
                <span className="cc-assessment">{found?.assessment??(a.id==="NEWS"?"UNAVAILABLE":"—")}</span>
              </div>;
            })}
          </div>
          <p className="cc-hint">Six evidence agents are connected: Scout, Trend, Momentum, Skeptic, Council and Risk. News remains disconnected until a verified news API is implemented.</p>
        </section>
        <div className="cc-lower">
          <section id="market" className="cc-panel">
            <div className="cc-panel-head"><div><h2>Live Exchange Chart</h2><p>{symbol} · {period} · {source||"No verified source"}</p></div><span className={"cc-chip "+(feedVerified?"cc-good":"cc-warn")}>{feedVerified?"REAL CANDLES":"OFFLINE"}</span></div>
            <LiveCandles candles={candles}/>
            {marketError&&<div className="cc-error" role="alert">Market feed: {marketError}</div>}
            <p className="cc-hint">Broker prices are labelled by source. Coinbase or Kraken fallback is not presented as Binance; no synthetic candles or prices are generated.</p>
          </section>
          <section id="evidence" className="cc-panel">
            <div className="cc-panel-head"><div><h2>Agent Evidence Feed</h2><p>{council?"Verified rule-based reports":"Awaiting API"}</p></div></div>
            {councilError&&<div className="cc-error" role="alert">{councilError}</div>}
            <div className="cc-feed">{council?.agents.length?council.agents.map(a=><article key={a.id} className="cc-message">
              <div className="cc-message-top"><b>{a.id}</b><span className={a.assessment==="VETO"?"cc-amber":"cc-lime"}>{a.assessment}</span></div>
              <p>{a.summary}</p><small>{a.observations[0]??""}</small>
            </article>):<p className="cc-muted">No verified council report received. No agent dialogue is invented.</p>}</div>
          </section>
        </div>
        <section id="risk" className="cc-panel cc-risk">
          <div className="cc-panel-head"><div><h2>Risk Gate &amp; Execution</h2><p>Backend-enforced restrictions · API read-only</p></div><span className="cc-chip cc-warn">LIVE ORDER EXECUTION DISABLED</span></div>
          <div className="cc-risk-metrics"><div><span>Decision</span><strong>{council?.verdict??"WAIT"}</strong></div>
            <div><span>Trade permission</span><strong className="cc-amber">BLOCKED</strong></div>
            <div><span>Account balance</span><strong>PRIVATE</strong></div>
            <div><span>Paper wallet</span><a href="#paper-desk">Manage my paper wallet ↓</a></div></div>
          <p className="cc-hint">Risk engine reports no execution authorization. Paper balances and orders are available only within your verified personal workspace.</p>
          {council?.blockers?.length?<div className="cc-blockers"><strong>Council risk warnings</strong><ul>{council.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul></div>:null}
        </section>
        <AccountWorkspace symbol={symbol}/>
        <footer className="cc-footer">One APEX AI Council dashboard · verified market evidence · individual paper wallets · no live-money execution</footer>
      </main>
    </div>
  </div>;
}
