/**
 * Bybit production account connector, READ-ONLY.
 * No Bybit order, trading, withdrawal or position mutation route exists.
 * Saved credentials are separately encrypted for each authenticated APEX user.
 */
import {identity,ensureUser,respond,checkOrigin,encrypt,decrypt,cryptoReady,readJson,type Env} from "../../../_lib/security";

type Ctx={request:Request;env:Env};
type KeyRow={enc_key:string;enc_secret:string;key_fingerprint:string;updated_at:number};
type BybitResponse<T>={retCode:number;retMsg:string;result:T;time?:number};
type ApiPermission={readOnly:number;permissions?:{Wallet?:string[]}};
type WalletResponse={list?:Array<{
 accountType?:string;totalEquity?:string;totalWalletBalance?:string;
 coin?:Array<{coin:string;equity?:string;walletBalance?:string;usdValue?:string}>
}>};
const ORIGIN="https://api.bybit.com";
const RECV_WINDOW="5000";
function validAmount(v:unknown):string {
 return typeof v==="string" && /^\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) ? v : "0";
}
async function signedGet<T>(key:string,secret:string,path:string,params?:URLSearchParams):Promise<T>{
 const timestamp=String(Date.now()),query=params?.toString()??"";
 const payload=timestamp+key+RECV_WINDOW+query;
 const hmac=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(payload)));
 const signature=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
 const requestUrl=ORIGIN+path+(query?"?"+query:"");
 let response:Response;
 try{
  response=await fetch(requestUrl,{method:"GET",redirect:"error",signal:AbortSignal.timeout(10500),
   headers:{
    "X-BAPI-API-KEY":key,
    "X-BAPI-TIMESTAMP":timestamp,
    "X-BAPI-RECV-WINDOW":RECV_WINDOW,
    "X-BAPI-SIGN":signature,
    "Accept":"application/json"
   },cache:"no-store"});
 }catch{
  throw Error("Bybit connection failed or was blocked from this Cloudflare server; no account data was substituted.");
 }
 if(!response.ok)throw Error("Bybit returned HTTP "+response.status+"; verify region, API key IP policy and network permissions.");
 if(!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
  throw Error("Bybit did not return verified JSON account data.");
 const parsed=await response.json() as BybitResponse<T>;
 if(!parsed||parsed.retCode!==0||!parsed.result)
  throw Error("Bybit denied the signed request (code "+String(parsed?.retCode??"unknown")+"); check credentials, restrictions or clock.");
 return parsed.result;
}
async function verifyReadOnly(key:string,secret:string):Promise<void>{
 const permission=await signedGet<ApiPermission>(key,secret,"/v5/user/query-api");
 if(permission.readOnly!==1)throw Error("This Bybit key has trading access. Create a READ-ONLY key first; trading keys are not accepted here.");
 const withdraw=permission.permissions?.Wallet??[];
 if(!Array.isArray(withdraw)||withdraw.includes("Withdraw"))
  throw Error("Bybit API key contains or has unknown withdrawal permissions. Connection denied.");
}
async function getWallet(key:string,secret:string){
 await verifyReadOnly(key,secret); // Recheck that the stored key was not changed to trade-enabled.
 const body=await signedGet<WalletResponse>(key,secret,"/v5/account/wallet-balance",
  new URLSearchParams({accountType:"UNIFIED"}));
 const account=body.list?.find(a=>a.accountType==="UNIFIED");
 if(!account||!Array.isArray(account.coin))throw Error("No valid Bybit Unified Trading Account balances received.");
 const balances=account.coin
  .filter(v=>v&&/^[A-Z0-9]{2,20}$/.test(v.coin))
  .map(v=>({
   asset:v.coin,
   walletBalance:validAmount(v.walletBalance),
   equity:validAmount(v.equity),
   usdValue:validAmount(v.usdValue)
  }))
  .filter(v=>Number(v.equity)>0||Number(v.walletBalance)>0).slice(0,100);
 return {
  environment:"BYBIT_PRODUCTION",
  liveFunds:true,readOnly:true,accountType:"UNIFIED",
  totalEquityUsd:validAmount(account.totalEquity),
  totalWalletBalanceUsd:validAmount(account.totalWalletBalance),
  balances,source:"Bybit V5 signed Unified Trading Account wallet-balance API",
  observedAt:Date.now()
 };
}
export async function onRequest({request,env}:Ctx):Promise<Response>{
 const route=new URL(request.url).pathname.replace(/^\/api\/private\/bybit\/?/,"").replace(/\/$/,"");
 if(!env.APEX_USERS_DB)return respond({error:"Account database is unavailable"},503);
 const who=await identity(request,env);
 if(!who)return respond({error:"Sign in with your personal APEX account"},401);
 if(!["GET","PUT","DELETE"].includes(request.method))return respond({error:"Method not allowed"},405);
 if(request.method!=="GET"&&!checkOrigin(request))return respond({error:"Invalid request origin"},403);
 try{
  await ensureUser(env.APEX_USERS_DB,who,Date.now());
  if(route==="status"&&request.method==="GET"){
   const found=await env.APEX_USERS_DB.prepare(
    "SELECT key_fingerprint,updated_at FROM council_bybit_live_credentials WHERE user_id=?"
   ).bind(who.id).first<{key_fingerprint:string;updated_at:number}>();
   return respond({
    connected:Boolean(found),fingerprint:found?.key_fingerprint??null,readOnly:true,
    environment:"BYBIT_PRODUCTION",encryptionConfigured:await cryptoReady(env),
    ordersEnabled:false,note:"Bybit production account connection, strictly read-only. No automatic trading is enabled."
   });
  }
  if(route==="credentials"&&request.method==="PUT"){
   if(!await cryptoReady(env))return respond({error:"Credential encryption is unavailable; nothing saved"},503);
   const input=await readJson(request,2000),key=input.apiKey,secret=input.secret;
   if(typeof key!=="string"||typeof secret!=="string"||key.length<16||key.length>256||secret.length<20||secret.length>256)
    return respond({error:"Enter your Bybit system-generated HMAC API key and secret (read-only permission)."},400);
   await verifyReadOnly(key,secret);
   // Also check the Bybit production wallet before storing credentials.
   await getWallet(key,secret);
   const [encKey,encSecret]=await Promise.all([
    encrypt(env,who.id,key,"bybit-live"),encrypt(env,who.id,secret,"bybit-live")
   ]);
   const fingerprint=key.slice(-4);
   await env.APEX_USERS_DB.prepare(
    "INSERT INTO council_bybit_live_credentials(user_id,enc_key,enc_secret,key_fingerprint,updated_at) VALUES(?,?,?,?,?) "+
    "ON CONFLICT(user_id) DO UPDATE SET enc_key=excluded.enc_key,enc_secret=excluded.enc_secret,key_fingerprint=excluded.key_fingerprint,updated_at=excluded.updated_at"
   ).bind(who.id,encKey,encSecret,fingerprint,Date.now()).run();
   return respond({connected:true,readOnly:true,environment:"BYBIT_PRODUCTION",fingerprint,ordersEnabled:false});
  }
  if(route==="credentials"&&request.method==="DELETE"){
   await env.APEX_USERS_DB.prepare("DELETE FROM council_bybit_live_credentials WHERE user_id=?").bind(who.id).run();
   return respond({connected:false});
  }
  if(route==="account"&&request.method==="GET"){
   const row=await env.APEX_USERS_DB.prepare(
    "SELECT enc_key,enc_secret,key_fingerprint,updated_at FROM council_bybit_live_credentials WHERE user_id=?"
   ).bind(who.id).first<KeyRow>();
   if(!row)return respond({error:"Connect your personal Bybit production read-only API key first"},404);
   const [key,secret]=await Promise.all([
    decrypt(env,who.id,row.enc_key,"bybit-live"),
    decrypt(env,who.id,row.enc_secret,"bybit-live")
   ]);
   return respond(await getWallet(key,secret));
  }
  return respond({error:"Private route not found"},404);
 }catch(e){
  const message=e instanceof Error?e.message:"Request failed";
  if(message.startsWith("Bybit")||message.startsWith("This Bybit"))
   return respond({error:message},502);
  if(message.includes("Credential")||message.includes("encryption"))
   return respond({error:"Credentials cannot be securely saved or decrypted."},503);
  console.error("Bybit credential request failed",e instanceof Error?e.name:"unknown");
  return respond({error:"Bybit connection unavailable; no account data was fabricated"},503);
 }
}
