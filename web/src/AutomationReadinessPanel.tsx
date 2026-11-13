import {useCallback,useEffect,useState} from "react";
import {api,type AutomationReadiness,type CouncilUser} from "./lib/api";

/** User-facing truth: the currently deployed app cannot submit 24/7 orders. */
export default function AutomationReadinessPanel({user}:{user:CouncilUser|null}){
 const [result,setResult]=useState<AutomationReadiness|null>(null);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
  if(!user)return;
  try{setResult(await api.automationStatus());setError("")}
  catch(e){setResult(null);setError(e instanceof Error?e.message:"Readiness unknown")}
 },[user?.id]);
 useEffect(()=>{
  if(!user){setResult(null);setError("");return;}
  void refresh();const interval=window.setInterval(()=>void refresh(),60_000);
  return()=>window.clearInterval(interval);
 },[user?.id,refresh]);
 return <section id="automation" className="cc-panel cc-workspace">
  <div className="cc-panel-head">
   <div><h2>Automatic Trading Control</h2><p>Binance or Bybit · Spot and Futures · future 24/7 execution service</p></div>
   <span className="cc-chip cc-warn">REAL TRADING OFF</span>
  </div>
  {!user?<p className="cc-muted">Sign in to see your personal exchange connection and risk readiness.</p>:
   <>
    {error&&<div className="cc-error" role="alert">{error}</div>}
    <div className="cc-testnet-details">
     <div><span>Maximum proposed risk</span><strong>2% per trade</strong></div>
     <div><span>Maximum order value</span><strong>2% of equity</strong></div>
     <div><span>Binance key</span><strong>{result?.exchanges.BINANCE.readOnlyKeyStored?"READ-ONLY KEY SAVED":"NOT CONNECTED"}</strong></div>
     <div><span>Bybit key</span><strong>{result?.exchanges.BYBIT.readOnlyKeyStored?"READ-ONLY KEY SAVED":"NOT CONNECTED"}</strong></div>
    </div>
    <p className="cc-hint">Automated Spot and Futures orders are NOT running. Read-only keys can view balances but cannot place trades. A separate execution credential and audited 24/7 service are required before enabling real-money orders.</p>
    {result?.blockers?.length?<div className="cc-blockers"><strong>Why automatic execution remains locked</strong>
      <ul>{result.blockers.map(item=><li key={item}>{item}</li>)}</ul></div>:null}
    <div className="cc-workspace-actions"><button type="button" onClick={()=>void refresh()}>Check readiness</button></div>
   </>
  }
 </section>;
}
