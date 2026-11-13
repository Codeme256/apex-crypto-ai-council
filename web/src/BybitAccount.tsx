import {useCallback,useEffect,useState} from "react";
import {api,type BybitLiveStatus,type BybitLiveAccount,type CouncilUser} from "./lib/api";

const describe=(e:unknown)=>e instanceof Error?e.message:"Unable to verify exchange connection";

export default function BybitAccount({user}:{user:CouncilUser|null}) {
 const [status,setStatus]=useState<BybitLiveStatus|null>(null);
 const [account,setAccount]=useState<BybitLiveAccount|null>(null);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [key,setKey]=useState("");
 const [secret,setSecret]=useState("");

 const refresh=useCallback(async()=>{
  if(!user)return;
  try{
   const result=await api.bybitStatus();
   setStatus(result);
   if(!result.connected){setAccount(null);return;}
   try{
    const data=await api.bybitAccount();
    setAccount(data);
    setMessage("");
   }catch(e){setAccount(null);setMessage(describe(e))}
  }catch(e){setStatus(null);setAccount(null);setMessage(describe(e))}
 },[user?.id]);

 useEffect(()=>{
  if(!user){
   setAccount(null);setStatus(null);setKey("");setSecret("");setMessage("");
   return;
  }
  void refresh();
  const interval=window.setInterval(()=>void refresh(),60_000);
  return ()=>window.clearInterval(interval);
 },[user?.id,refresh]);

 async function connect(){
  if(!user||!status?.encryptionConfigured||loading)return;
  setLoading(true);setMessage("");
  try{
   await api.saveBybitKey(key,secret);
   setMessage("Your Bybit production read-only key has been verified and encrypted.");
   await refresh();
  }catch(e){setMessage(describe(e))}
  finally{setKey("");setSecret("");setLoading(false)}
 }

 async function disconnect(){
  if(!user||loading||!status?.connected)return;
  setLoading(true);setMessage("");
  try{
   await api.disconnectBybit();
   setAccount(null);setStatus(null);await refresh();
   setMessage("Bybit credentials disconnected from this account.");
  }catch(e){setMessage(describe(e))}
  finally{setLoading(false)}
 }

 return <section id="bybit-live" className="cc-panel cc-workspace">
  <div className="cc-panel-head"><div><h2>Real Bybit Account — Read Only</h2>
   <p>Per-user production Unified Trading Account; real exchange values, not paper wallets</p></div>
   <span className={"cc-chip "+(account?"cc-good":"cc-warn")}>
    {!user?"SIGN IN REQUIRED":account?"BYBIT VERIFIED":status?.connected?"CANNOT VERIFY":"NOT CONNECTED"}
   </span>
  </div>
  {!user?<p className="cc-muted">Sign in to My APEX Account to connect your own Bybit API key.</p>:<>
   <div className="cc-testnet-details">
    <div><span>Exchange</span><strong>BYBIT PRODUCTION</strong></div>
    <div><span>Account</span><strong>UNIFIED</strong></div>
    <div><span>Key</span><strong>{status?.connected?"Encrypted ••••"+status.fingerprint:"Not connected"}</strong></div>
    <div><span>Trading permission</span><strong className="cc-amber">READ ONLY · AUTO-TRADING OFF</strong></div>
   </div>
   {!status?.connected&&<div className="cc-credentials">
    <label>Bybit production HMAC API key (Read Only)
     <input type="text" autoComplete="off" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder="Bybit system-generated API key"/>
    </label>
    <label>Bybit API secret
     <input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Encrypted server-side after verification"/>
    </label>
    <button type="button" onClick={()=>void connect()} disabled={loading||!status?.encryptionConfigured||key.length<16||secret.length<20}>
      {loading?"Checking Bybit…":"Connect and verify Bybit"}
    </button>
   </div>}
   <div className="cc-workspace-actions">
    <button type="button" disabled={loading||!status?.connected} onClick={()=>void refresh()}>Refresh actual balances</button>
    <button type="button" disabled={loading||!status?.connected} onClick={()=>void disconnect()}>Disconnect Bybit</button>
   </div>
   {message&&<div className="cc-notice" role="status">{message}</div>}
   {account?<div>
    <p className="cc-hint">Verified {new Date(account.observedAt).toLocaleString()} from {account.source}. These values reflect the Bybit Unified Trading Account, which can include Spot and derivatives collateral; they are not a promise of available cash.</p>
    <div className="cc-wallet-metrics">
     <div><span>Total equity (USD)</span><strong>{account.totalEquityUsd}</strong></div>
     <div><span>Total wallet balance (USD)</span><strong>{account.totalWalletBalanceUsd}</strong></div>
     <div><span>Assets with balances</span><strong>{account.balances.length}</strong></div>
     <div><span>Order execution</span><strong>DISABLED</strong></div>
    </div>
    <div className="cc-table-scroll"><table className="cc-data-table">
      <thead><tr><th>Real asset</th><th>Wallet balance</th><th>Equity</th><th>USD value</th></tr></thead>
      <tbody>{account.balances.length?account.balances.map(b=><tr key={b.asset}><td>{b.asset}</td><td>{b.walletBalance}</td><td>{b.equity}</td><td>{b.usdValue}</td></tr>):
       <tr><td colSpan={4}>No non-zero assets returned by Bybit</td></tr>}</tbody>
    </table></div>
   </div>:<p className="cc-hint">No real balance will appear unless the signed Bybit permission and wallet requests succeed. Exchange connectivity and regional API restrictions can prevent verification.</p>}
   <p className="cc-hint">Create a Bybit system-generated **HMAC Read Only** key; do not grant withdrawal or trading permission to this connection. Your API secret is never displayed after saving. Real automatic orders require a separately tested execution service and owner authorization.</p>
  </>}
 </section>;
}
