import {useCallback,useEffect,useMemo,useState} from "react";
import {api,type CouncilUser,type PersonalBinanceStatus,type BinanceTestnetAccount} from "./lib/api";
import {initialPaper,paperEquity,TRADABLE,type PaperState} from "./lib/paper-trading";

type Quote={symbol:string;price:number|null;source?:string;timestamp?:number;ok:boolean};
const fmt=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?"—":n.toLocaleString(undefined,{maximumFractionDigits:6});
const time=(n:number)=>new Date(n).toLocaleString();
const errorMessage=(e:unknown)=>e instanceof Error?e.message:"An unexpected error occurred";

export default function AccountWorkspace({symbol}:{symbol:string}) {
 const [user,setUser]=useState<CouncilUser|null>(null);
 const [sessionChecked,setSessionChecked]=useState(false);
 const [sessionBusy,setSessionBusy]=useState(false);
 const [sessionError,setSessionError]=useState("");
 const [wallet,setWallet]=useState<PaperState|null>(null);
 const [quotes,setQuotes]=useState<Quote[]>([]);
 const [quotesError,setQuotesError]=useState("");
 const [paperBusy,setPaperBusy]=useState(false);
 const [paperNotice,setPaperNotice]=useState("");
 const [orderSize,setOrderSize]=useState("25");
 const [testnetStatus,setTestnetStatus]=useState<PersonalBinanceStatus|null>(null);
 const [testnetAccount,setTestnetAccount]=useState<BinanceTestnetAccount|null>(null);
 const [key,setKey]=useState("");
 const [secret,setSecret]=useState("");
 const [testnetBusy,setTestnetBusy]=useState(false);
 const [testnetMessage,setTestnetMessage]=useState("");

 const loadSession=useCallback(async()=>{
  setSessionBusy(true);setSessionError("");
  try {
   const identity=await api.registerOrLogin();
   setUser(identity.user);
   const results=await Promise.allSettled([api.privatePaper(),api.binanceStatus()]);
   if(results[0].status==="fulfilled"){
    setWallet(results[0].value.wallet);
   } else {
    setWallet(null);
    setSessionError("Your paper wallet cannot be loaded: "+errorMessage(results[0].reason));
   }
   if(results[1].status==="fulfilled")setTestnetStatus(results[1].value);
   else {
    setTestnetStatus(null);
    setSessionError(old=>[old,"Your Binance Testnet configuration could not be retrieved."].filter(Boolean).join(" "));
   }
  } catch (e) {
   setUser(null);
   setWallet(null);
   setTestnetStatus(null);
   setTestnetAccount(null);
   // Guest accounts are never shown a fabricated wallet or exchange balance.
   const message=errorMessage(e);
   if(!/401|sign in|not authenticated/i.test(message))setSessionError(message);
  } finally {setSessionChecked(true);setSessionBusy(false)}
 },[]);

 const loadQuotes=useCallback(async()=>{
  try {
   const response=await api.ticker([...TRADABLE]);
   setQuotes(response.tickers);
   setQuotesError(response.tickers.some(q=>q.ok&&q.price!=null)?"":"No verified exchange quotes available");
  }catch(e){setQuotes([]);setQuotesError(errorMessage(e))}
 },[]);

 useEffect(()=>{
  void loadSession();
  void loadQuotes();
  const id=window.setInterval(()=>void loadQuotes(),20_000);
  return()=>window.clearInterval(id);
 },[loadSession,loadQuotes]);

 const prices=useMemo(()=>Object.fromEntries(quotes.filter(q=>q.ok&&q.price!=null&&q.price>0).map(q=>[q.symbol,q.price!])),[quotes]);
 const equity=wallet?paperEquity(wallet,prices):null;
 const quote=quotes.find(q=>q.symbol===symbol&&q.ok&&q.price!=null&&q.price>0);
 const quoteFresh=Boolean(quote?.timestamp&&Date.now()-quote.timestamp<45_000&&quote.timestamp<Date.now()+10_000);
 const tradesToday=wallet?.trades.filter(t=>new Date(t.at).toISOString().slice(0,10)===new Date().toISOString().slice(0,10)).length??0;
 const positions=wallet?Object.entries(wallet.positions):[];

 async function submit(side:"BUY"|"SELL"){
  if(!user||!wallet||paperBusy||!quoteFresh)return;
  setPaperBusy(true);setPaperNotice("");
  try{
   const amount=Number(orderSize);
   if(!Number.isFinite(amount)||amount<5)throw Error("Enter an order size of at least 5 USDT");
   const result=await api.privatePaperOrder(symbol,side,amount);
   setWallet(result.wallet);
   setPaperNotice("SIMULATED "+side+" recorded in your private cloud wallet; no Binance order was sent.");
   void loadQuotes();
  }catch(e){setPaperNotice(errorMessage(e))}
  finally{setPaperBusy(false)}
 }
 async function switchKill(){
  if(!wallet||!user||paperBusy)return;
  setPaperBusy(true);setPaperNotice("");
  try{
   const result=await api.privatePaperKill(!wallet.killSwitch);
   setWallet(result.wallet);
   setPaperNotice(result.wallet.killSwitch?"Paper orders stopped.":"Paper orders re-enabled for this wallet.");
  }catch(e){setPaperNotice(errorMessage(e))}
  finally{setPaperBusy(false)}
 }
 async function connectTestnet(){
  if(!user||!testnetStatus?.encryptionConfigured||!key||!secret||testnetBusy)return;
  setTestnetBusy(true);setTestnetMessage("");
  try{
   await api.saveTestnetCredentials(key,secret);
   setKey("");setSecret("");setTestnetAccount(null);
   setTestnetStatus(await api.binanceStatus());
   setTestnetMessage("Binance Spot Testnet credentials saved in your encrypted account. Check balances to verify connection.");
  }catch(e){setTestnetMessage(errorMessage(e))}
  finally{setKey("");setSecret("");setTestnetBusy(false)}
 }
 async function checkTestnet(){
  if(!user||!testnetStatus?.connected||testnetBusy)return;
  setTestnetBusy(true);setTestnetMessage("");
  try{
   const response=await api.binanceAccount();
   setTestnetAccount(response);
   setTestnetMessage("Binance Spot Testnet account checked. These are virtual testnet funds, not real funds.");
  }catch(e){setTestnetAccount(null);setTestnetMessage(errorMessage(e))}
  finally{setTestnetBusy(false)}
 }
 async function removeTestnet(){
  if(!user||!testnetStatus?.connected||testnetBusy)return;
  setTestnetBusy(true);setTestnetMessage("");
  try{
   await api.disconnectTestnet();
   setTestnetStatus(await api.binanceStatus());
   setTestnetAccount(null);
   setTestnetMessage("Your Binance Testnet credential connection was removed.");
  }catch(e){setTestnetMessage(errorMessage(e))}
  finally{setTestnetBusy(false)}
 }
 return <>
  <section id="account" className="cc-panel cc-workspace">
   <div className="cc-panel-head"><div><h2>My APEX Account</h2><p>Existing Cloudflare Access email authentication · isolated D1 account records</p></div>
    <span className={"cc-chip "+(user?"cc-good":"cc-warn")}>{sessionBusy?"VERIFYING SESSION":user?"SIGNED IN":"SIGN IN REQUIRED"}</span></div>
   {sessionError&&<div className="cc-error" role="alert">{sessionError}</div>}
   {!sessionChecked?<p className="cc-muted">Checking your secure login…</p>:
    !user?<div className="cc-user-line">
      <div><strong>You are viewing public market data</strong><p className="cc-hint">Sign in with your email to access your existing private paper wallet and your own Binance Testnet connection. No new wallet or broker account is required.</p></div>
      <a className="cc-action-link" href="/api/private/welcome">Register / Sign in with email</a>
    </div>:<div className="cc-user-line">
      <div><span className="cc-hint">Signed in as</span><strong>{user.email}</strong><p className="cc-hint">Your virtual wallet and credentials are accessible only within this verified account.</p></div>
      <div className="cc-workspace-actions">
       <button type="button" onClick={()=>void loadSession()} disabled={sessionBusy}>Refresh my account</button>
       <a className="cc-action-link cc-neutral" href="https://dawn-shadow-4219.cloudflareaccess.com/cdn-cgi/access/logout">Sign out</a>
      </div>
    </div>}
  </section>

  <section id="paper-desk" className="cc-panel cc-workspace">
   <div className="cc-panel-head"><div><h2>Paper Trading &amp; Portfolio</h2><p>Your existing server-side simulated Spot wallet, not a new second dashboard</p></div>
    <span className={"cc-chip "+(wallet&&!wallet.killSwitch?"cc-good":"cc-warn")}>{!user?"SIGN IN REQUIRED":!wallet?"UNAVAILABLE":wallet.killSwitch?"ORDERS HALTED":"SIMULATION ENABLED"}</span>
   </div>
   <div className="cc-wallet-metrics">
    <div><span>Virtual cash</span><strong>{fmt(wallet?.cash)} {wallet?"USDT":""}</strong></div>
    <div><span>Estimated paper equity</span><strong>{fmt(equity)} {wallet?"USDT":""}</strong></div>
    <div><span>Today's paper trades</span><strong>{wallet?tradesToday+"/6":"—"}</strong></div>
    <div><span>Held symbols</span><strong>{wallet?positions.length:"—"}</strong></div>
   </div>
   <p className="cc-hint">These are simulated values in the authenticated D1 wallet, not a Binance account balance. Mark-to-market prices may be stale or unavailable.</p>
   <div className="cc-order-row">
    <div className="cc-input-block"><label htmlFor="cc-order-usdt">Order size (USDT)</label><input id="cc-order-usdt" type="number" min="5" step="1" value={orderSize} onChange={e=>setOrderSize(e.target.value)}/></div>
    <div className="cc-order-quote"><span>{symbol}</span><strong>{quoteFresh?fmt(quote?.price):"UNAVAILABLE"}</strong><small>{quoteFresh?quote?.source:"A recent verified quote is required"}</small></div>
    <button className="cc-buy" type="button" disabled={!user||!wallet||wallet.killSwitch||paperBusy||!quoteFresh} onClick={()=>void submit("BUY")}>{paperBusy?"Processing…":"Simulate BUY"}</button>
    <button className="cc-sell" type="button" disabled={!user||!wallet||wallet.killSwitch||paperBusy||!quoteFresh} onClick={()=>void submit("SELL")}>Simulate SELL</button>
    <button type="button" disabled={!user||!wallet||paperBusy} onClick={()=>void switchKill()}>{wallet?.killSwitch?"Resume paper orders":"Stop paper orders"}</button>
   </div>
   {quotesError&&<p className="cc-hint" role="status">Market quote status: {quotesError}</p>}
   {paperNotice&&<div className="cc-notice" role="status">{paperNotice}</div>}
   <div className="cc-tables">
    <div><h3>Current paper holdings</h3><div className="cc-table-scroll"><table className="cc-data-table"><thead><tr><th>Symbol</th><th>Quantity</th><th>Cost basis (USDT)</th></tr></thead>
     <tbody>{positions.length?positions.map(([name,pos])=><tr key={name}><td>{name}</td><td>{fmt(pos.qty)}</td><td>{fmt(pos.cost)}</td></tr>):<tr><td colSpan={3}>No verified simulated holdings</td></tr>}</tbody></table></div></div>
    <div id="trade-history"><h3>Paper trade history</h3><div className="cc-table-scroll"><table className="cc-data-table"><thead><tr><th>Action</th><th>Symbol</th><th>USDT</th><th>Time</th></tr></thead>
     <tbody>{wallet?.trades.length?wallet.trades.slice(0,15).map(t=><tr key={t.id}><td>{t.side}</td><td>{t.symbol}</td><td>{fmt(t.gross)}</td><td>{time(t.at)}</td></tr>):<tr><td colSpan={4}>No recorded simulated transactions</td></tr>}</tbody></table></div></div>
   </div>
   <p className="cc-hint">Risk rules remain enforced by the existing backend: 5% maximum paper equity per order, six orders daily, 2% realized-loss stop and 0.1% estimated fees per side. No futures leverage or real-money orders.</p>
  </section>

  <section id="binance-testnet" className="cc-panel cc-workspace">
   <div className="cc-panel-head"><div><h2>My Binance Spot Testnet</h2><p>Individual, encrypted testnet credentials attached to your existing email identity</p></div>
    <span className={"cc-chip "+(testnetStatus?.connected?"cc-good":"cc-warn")}>{!user?"SIGN IN REQUIRED":testnetStatus?.connected?"TESTNET CONNECTED":"NOT CONNECTED"}</span></div>
   {!user?<p className="cc-muted">Sign in under My APEX Account to manage your personal testnet configuration. Do not enter credentials on this public screen.</p>:
     <>
      <div className="cc-testnet-details">
        <div><span>Exchange</span><strong>Binance Spot TESTNET</strong></div>
        <div><span>Stored key</span><strong>{testnetStatus?.connected?"Connected ••••"+(testnetStatus.fingerprint??""):"None"}</strong></div>
        <div><span>Server-side encryption</span><strong>{testnetStatus?.encryptionConfigured?"Configured":"Administrator setup required"}</strong></div>
        <div><span>Real orders</span><strong className="cc-amber">DISABLED</strong></div>
      </div>
      {!testnetStatus?.connected&&<div className="cc-credentials">
        <label>Binance Spot Testnet API key<input type="text" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="Testnet key only"/></label>
        <label>Binance Spot Testnet secret<input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Not your real Binance secret"/></label>
        <button type="button" disabled={testnetBusy||!testnetStatus?.encryptionConfigured||!key||!secret} onClick={()=>void connectTestnet()}>Save &amp; verify Testnet key</button>
      </div>}
      <div className="cc-workspace-actions">
        <button type="button" disabled={!testnetStatus?.connected||testnetBusy} onClick={()=>void checkTestnet()}>View my Testnet balances</button>
        <button type="button" disabled={!testnetStatus?.connected||testnetBusy} onClick={()=>void removeTestnet()}>Disconnect Testnet</button>
      </div>
      {testnetMessage&&<div className="cc-notice" role="status">{testnetMessage}</div>}
      {testnetAccount&&<div className="cc-table-scroll"><table className="cc-data-table"><thead><tr><th>Asset</th><th>Virtual available</th><th>Locked</th></tr></thead>
        <tbody>{testnetAccount.balances.map(b=><tr key={b.asset}><td>{b.asset}</td><td>{b.free}</td><td>{b.locked}</td></tr>)}</tbody></table></div>}
      <p className="cc-hint">Only Binance Spot Testnet credentials belong here. Keep real Binance production API secrets out of this form. The app never sends credentials to AI agents or stores them in the browser.</p>
     </>
   }
  </section>
 </>;
}
