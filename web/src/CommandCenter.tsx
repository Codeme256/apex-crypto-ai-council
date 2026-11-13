import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";
import { api, type CandleResponse, type Candle, type CouncilReport, type Health, type NewsResponse } from "./lib/api";
import "./styles/command-center.css";
import AccountWorkspace from "./AccountWorkspace";

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "BONKUSDT", "FLOKIUSDT"] as const;
const PERIODS = ["1m", "5m", "15m", "1h", "4h"] as const;
const AGENTS = [
  {id:"SCOUT",name:"Scout",work:"SCANNING",role:"Structure & opportunities",x:9,y:50,initial:"S"},
  {id:"TREND",name:"Trend",work:"ANALYZING",role:"EMA trend validation",x:32,y:17,initial:"T"},
  {id:"MOMENTUM",name:"Momentum",work:"ANALYZING",role:"RSI & trade volume",x:32,y:80,initial:"M"},
  {id:"NEWS",name:"News",work:"READING HEADLINES",role:"Source-linked crypto news",x:32,y:49,initial:"N"},
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
  const [news,setNews]=useState<NewsResponse|null>(null);
  const [newsError,setNewsError]=useState("");
  const [marketError,setMarketError]=useState("");
  const [councilError,setCouncilError]=useState("");
  const [updating,setUpdating]=useState(false);
  const [lastQuote,setLastQuote]=useState<{price:number;timestamp:number;source:string}|null>(null);
  const [automatic,setAutomatic]=useState(true);
  const [version,setVersion]=useState(0);
  const requestVersion=useRef(0);

  const refresh=useCallback(async()=>{
    const version=++requestVersion.current;
    setUpdating(true);
    setMarketError("");setCouncilError("");setNewsError("");
    // The Council evaluates exactly the candle source and timestamps it returns.
    // News independently fetches sourced articles and NEVER fabricates a directional score.
    const [assessment,status,headlines]=await Promise.allSettled([
      api.council(symbol,period),api.health(),api.news(symbol)
    ]);
    if(version!==requestVersion.current)return;
    let result:CouncilReport|null=null;
    if(assessment.status==="fulfilled"&&assessment.value.symbol===symbol&&assessment.value.timeframe===period){
      result=assessment.value;
      setCouncil(result);
      setCouncilError("");
    }else{
      setCouncil(null);
      setCouncilError(assessment.status==="rejected"?
        String(assessment.reason instanceof Error?assessment.reason.message:assessment.reason):
        "Council assessment unavailable for the selected market");
    }
    let market:CandleResponse|null=result?.market??null;
    if(!market){
      // Allow a verified price chart when the Council is unavailable, but show
      // the Council as unavailable rather than pretending it analyzed these bars.
      try{market=await api.candles(symbol,period,180)}
      catch(e){if(version===requestVersion.current)setMarketError(e instanceof Error?e.message:String(e))}
    }
    if(version!==requestVersion.current)return;
    if(market&&market.symbol===symbol&&market.interval===period&&
      (!result||market.source===result.source)){
      const valid=market.candles.filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&
        c.time>0&&c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));
      setCandles(valid);
      setSource(valid.length?market.source:"");
      setMarketAt(valid.length?market.retrievedAt:null);
      if(!valid.length)setMarketError("No verified market candles available");
    }else{
      setCandles([]);setSource("");setMarketAt(null);
      if(!marketError)setMarketError("Market candles unavailable or not from the Council evidence source");
    }
    setHealth(status.status==="fulfilled"?status.value:null);
    if(headlines.status==="fulfilled"&&headlines.value.symbol===symbol){
      setNews(headlines.value);
      setNewsError("");
    }else{
      setNews(null);
      setNewsError(headlines.status==="rejected"?
        String(headlines.reason instanceof Error?headlines.reason.message:headlines.reason):
        "News provider result did not match the selected symbol");
    }
    setUpdating(false);
  },[symbol,period]);
  useEffect(()=>{
    if(!automatic)return;
    void refresh();
    const timer=window.setInterval(()=>{void refresh()},60000);
    return()=>{window.clearInterval(timer);requestVersion.current++};
  },[refresh,automatic,version]);

  useEffect(()=>{
    setLastQuote(null);
    if(!automatic||!source)return;
    const provider=source.startsWith("Binance")?"binance":source.startsWith("Coinbase")?"coinbase":source.startsWith("Kraken")?"kraken":null;
    if(!provider)return;
    let stopped=false;
    const poll=async()=>{
      try{
        const result=await api.ticker([symbol],provider);
        const price=result.tickers[0];
        if(stopped)return;
        if(price?.ok&&price.price!==null&&Number.isFinite(price.price)&&price.price>0&&
           price.timestamp&&Date.now()-price.timestamp<45_000&&
           price.source===source){
          setLastQuote({price:price.price,source:price.source,timestamp:price.timestamp});
        }else setLastQuote(null);
      }catch{if(!stopped)setLastQuote(null)}
    };
    void poll();
    const timer=window.setInterval(()=>void poll(),10000);
    return()=>{stopped=true;window.clearInterval(timer)};
  },[automatic,symbol,source]);
  const last=candles.at(-1);
  const first=candles[0];
  const percentage=last&&first?((last.close-first.open)/first.open)*100:null;
  const byId=Object.fromEntries((council?.agents??[]).map(a=>[a.id,a])) as Record<string,CouncilReport["agents"][number]|undefined>;
  const feedVerified=Boolean(last&&source&&marketAt&&Date.now()-marketAt<120_000);
  const quote=lastQuote&&Date.now()-lastQuote.timestamp<45_000?lastQuote:
    council?.quote&&Date.now()-council.quote.timestamp<45_000&&council.quote.source===source?
      council.quote:null;
  const hasEvidence=(id:AgentId)=>id==="NEWS"?Boolean(news?.items.length):Boolean(byId[id]);
  const agentState=(id:AgentId)=>{
    if(id==="NEWS")return updating?"FETCHING":news?.items.length?"SOURCES VERIFIED":newsError?"UNAVAILABLE":"NO FRESH NEWS";
    if(updating)return AGENTS.find(a=>a.id===id)?.work??"CHECKING";
    if(byId[id])return !automatic?"PAUSED":byId[id]?.state==="BLOCKED"?"RISK WATCH":"MONITORING";
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
        <a className="cc-menu" href="#news">◈ <span>News Intelligence</span></a>
        <a className="cc-menu" href="#risk">⛨ <span>Risk Control</span></a>
        <p className="cc-menu-label">My workspace</p>
        <a className="cc-menu" href="#account">◫ <span>My Account</span></a>
        <a className="cc-menu" href="#binance-live">◈ <span>Real Binance Spot</span></a>
        <a className="cc-menu" href="#paper-desk">⇄ <span>Paper Trading</span></a>
        <a className="cc-menu" href="#trade-history">▣ <span>Trade History</span></a>
        <a className="cc-menu" href="#binance-testnet">⌘ <span>Binance Testnet</span></a>
        <p className="cc-sidebar-note">Connected to this site's existing Crypto Council API. Live-money order execution is disabled.</p>
      </aside>
      <main className="cc-main">
        <section id="overview" className="cc-intro">
          <div><div className="cc-eyebrow">VERIFIED EXCHANGE DATA · AUTOMATED EVIDENCE REVIEWS</div>
            <h1>AI Trading War Room</h1>
            <p>The live-data flow animates continuously while connected. Exchange quotes refresh every 10 seconds; independent agent reports and publisher news refresh every 60 seconds. No simulated work or profit is shown.</p>
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
          <article className="cc-stat"><span>Real exchange quote</span><strong>{format(quote?.price)}</strong><small>{quote?quote.source+" · "+clock(quote.timestamp):"No fresh source-matched quote"} · last candle {format(last?.close)}</small></article>
          <article className="cc-stat"><span>Council verdict</span><strong className={council?.verdict==="WATCH"?"cc-lime":"cc-amber"}>{council?.verdict??"UNAVAILABLE"}</strong><small>{council?.bias??"No verified assessment"} · no trades</small></article>
          <article className="cc-stat"><span>API status</span><strong>{health?.overall??"UNAVAILABLE"}</strong><small>{health?.modeDefault??"NO DATA"} · last update {clock(marketAt)}</small></article>
        </div>

        <section id="arena" className="cc-panel cc-arena-panel">
          <div className="cc-panel-head"><div><h2>AI Council Arena</h2><p>Continuous visual signal flow for connected data sources; genuine evidence reports update every minute.</p></div><span className="cc-chip">{!automatic?"UPDATES PAUSED":updating?"ANALYSIS REQUEST RUNNING":council?"MONITORING · LAST REPORT RECEIVED":"NO VERIFIED AGENT DATA"}</span></div>
          <div className={"cc-arena "+(automatic?"cc-always-live":"cc-visual-paused")}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="cc-connections" aria-hidden="true">
              {LINKS.map(([a,b])=>{const linked=automatic&&hasEvidence(a)&&hasEvidence(b);return <line key={a+b} className={linked?"cc-link-live":"cc-link-idle"} x1={COORDS[a].x} y1={COORDS[a].y} x2={COORDS[b].x} y2={COORDS[b].y} strokeWidth={linked?0.5:0.2} stroke={linked?"#41dbe9":"#284356"} strokeDasharray={linked?"1.2 1.2":undefined}/>})}
            </svg>
            {AGENTS.map(a=>{
              const found=byId[a.id];
              const working=updating&&hasEvidence(a.id);
              return <div className={"cc-node "+(working?"cc-working ":"")+(automatic&&hasEvidence(a.id)?"cc-agent-active ":"")+(found?.assessment==="VETO"?"cc-veto ":"")+(!hasEvidence(a.id)?"cc-offline":"")} key={a.id} style={{left:a.x+"%",top:a.y+"%"}}>
                <div className="cc-node-icon">{a.initial}</div>
                <b>{a.name}</b>
                <small>{agentState(a.id)}</small>
                <span className="cc-assessment">{a.id==="NEWS"?(news?.items.length?"HEADLINES":"UNAVAILABLE"):(found?.assessment??"—")}</span>
              </div>;
            })}
          </div>
          <p className="cc-hint">The pulsing rings and moving connections are a continuous visual indicator of an available data source—not proof that an AI model is reasoning every second. Six technical agents review one verified market snapshot. News displays publisher headlines only.</p>
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
        <section id="news" className="cc-panel cc-news">
          <div className="cc-panel-head">
            <div><h2>News Intelligence</h2><p>Verified publisher headlines · no invented sentiment or price predictions</p></div>
            <span className={"cc-chip "+(news?.items.length?"cc-good":"cc-warn")}>
              {updating?"CHECKING SOURCES":news?.items.length?news.status+" · "+news.items.length+" ARTICLES":"SOURCE UNAVAILABLE"}
            </span>
          </div>
          <p className="cc-hint">
            Selected market: {symbol} · Publisher feed check: {news?clock(news.retrievedAt):"Not available"}
            {news?.sourcesAvailable?.length?" · Available: "+news.sourcesAvailable.join(", "):""}
            {news?.sourcesUnavailable?.length?" · Unavailable: "+news.sourcesUnavailable.join(", "):""}
          </p>
          {newsError&&<div className="cc-error" role="alert">News providers: {newsError}. No headlines or market impact ratings have been fabricated.</div>}
          {news?.items.length?<div className="cc-news-grid">{news.items.map(item=>
            <article className="cc-news-card" key={item.url}>
              <div className="cc-news-meta"><span>{item.source}</span><span>{item.relevance==="SYMBOL"?"SYMBOL MENTION":"CRYPTO MARKET"}</span></div>
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
              <time dateTime={new Date(item.publishedAt).toISOString()}>{new Date(item.publishedAt).toLocaleString()}</time>
            </article>
          )}</div>:<p className="cc-muted">{updating?"Retrieving current publisher headlines…":"No verified headlines available at present."}</p>}
          <p className="cc-hint">Headline relevance comes from keyword matching, not an AI prediction. News is displayed independently and does not override trading risk limits or imply that a price movement was caused by a story.</p>
        </section>
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
