import {identity,respond,checkOrigin,ensureUser,encrypt,decrypt,cryptoReady,readJson,type Env} from "./security";
import {initialPaper,paperOrder,type PaperState} from "../../../src/lib/paper-trading";
import {onRequest as marketApi} from "../[[path]]";
type Ctx={request:Request;env:Env};
type KeyRow={enc_key:string;enc_secret:string;key_fingerprint:string;updated_at:number};
type WalletRow={wallet_json:string;version:number;updated_at:number};
const SYMBOLS=new Set(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","SHIBUSDT","PEPEUSDT","BONKUSDT","FLOKIUSDT"]);
const BASE="https://testnet.binance.vision";
const parseWallet=(r:WalletRow|null):PaperState=>{
 if(!r)return initialPaper();
 try{const s=JSON.parse(r.wallet_json) as PaperState;
  if(s.version===1&&Number.isFinite(s.cash)&&s.cash>=0&&Array.isArray(s.trades)&&s.positions&&typeof s.positions==="object")return s;
 }catch{/* Invalid stored wallet must not become an order. */}
 throw Error("Stored wallet needs administrator repair");
};
async function getWallet(env:Env,userId:string){
 const row=await env.APEX_USERS_DB!.prepare("SELECT wallet_json,version,updated_at FROM council_paper_accounts WHERE user_id=?").bind(userId).first<WalletRow>();
 return {wallet:parseWallet(row),version:row?.version??null};
}
async function updateWallet(env:Env,userId:string,next:PaperState,version:number|null){
 const now=Date.now(),encoded=JSON.stringify(next);
 if(version===null){
  const r=await env.APEX_USERS_DB!.prepare("INSERT OR IGNORE INTO council_paper_accounts(user_id,wallet_json,version,updated_at) VALUES(?,?,1,?)").bind(userId,encoded,now).run();
  return (r.meta?.changes??0)===1;
 }
 const r=await env.APEX_USERS_DB!.prepare("UPDATE council_paper_accounts SET wallet_json=?,version=version+1,updated_at=? WHERE user_id=? AND version=?")
  .bind(encoded,now,userId,version).run();
 return (r.meta?.changes??0)===1;
}
async function signed(apiKey:string,secret:string,path:string,params:Record<string,string>,method:"GET"|"POST"){
 const body=new URLSearchParams({...params,recvWindow:"5000",timestamp:String(Date.now())}).toString();
 const hmac=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(body)));
 const signature=Array.from(sig,x=>x.toString(16).padStart(2,"0")).join("");
 const res=await fetch(BASE+path+"?"+body+"&signature="+signature,{method,headers:{"X-MBX-APIKEY":apiKey,accept:"application/json"},signal:AbortSignal.timeout(8500)});
 if(!res.ok)throw Error("Testnet rejected signed request (HTTP "+res.status+"); verify key permissions, credentials and network access");
 return res.json();
}
async function verifiedQuote(req:Request,env:Env,symbol:string):Promise<{price:number;source:string;timestamp:number}>{
 const target=new URL(req.url);
 target.pathname="/api/ticker";
 target.search="?symbols="+encodeURIComponent(symbol);
 const r=await marketApi({request:new Request(target.toString()),env});
 if(!r.ok)throw Error("Market provider is unavailable");
 const body=await r.json() as {tickers?:Array<{price:number|null;source:string;timestamp:number;ok:boolean}>};
 const quote=body.tickers?.[0];
 if(!quote?.ok||!quote.price||quote.price<=0||!Number.isFinite(quote.timestamp)||
  Date.now()-quote.timestamp>45_000||quote.timestamp>Date.now()+10_000)throw Error("Current exchange price is unavailable or stale");
 return {price:quote.price,source:quote.source,timestamp:quote.timestamp};
}
export async function onRequest({request,env}:Ctx):Promise<Response>{
 // Fail securely if Cloudflare Access/D1 are missing. Do not read global API credentials.
 if(!env.APEX_USERS_DB||!env.ACCESS_AUD||!env.ACCESS_TEAM_DOMAIN)
  return respond({error:"User accounts are not fully configured on Cloudflare Pages"},503);
 const who=await identity(request,env);
 if(!who)return respond({error:"Verified email login required",loginPath:"/api/private/me"},401);
 if(!["GET","POST","PUT","DELETE"].includes(request.method))return respond({error:"Method not allowed"},405);
 if(request.method!=="GET"&&!checkOrigin(request))return respond({error:"Invalid request origin or content type"},403);
 const route=new URL(request.url).pathname.replace(/^\/api\/private\/?/,"").replace(/\/$/,"");
 try{
  await ensureUser(env.APEX_USERS_DB,who,Date.now());
  if(route==="me"&&request.method==="GET")return respond({user:{email:who.email,id:who.id},mode:"SPOT_TESTNET_AND_PAPER",registered:true});
  if(route==="paper"&&request.method==="GET"){
   const {wallet,version}=await getWallet(env,who.id);
   return respond({wallet,version,storage:"D1, isolated by verified user id"});
  }
  if(route==="paper/orders"&&request.method==="POST"){
   const body=await readJson(request,1000);
   const symbol=String(body.symbol??"").toUpperCase(),side=body.side;
   const amount=Number(body.amount);
   if(!SYMBOLS.has(symbol)||!["BUY","SELL"].includes(String(side))||!Number.isFinite(amount)||amount<5||amount>500)
    return respond({error:"Invalid Spot paper order or symbol"},400);
   const {wallet,version}=await getWallet(env,who.id);
   const quote=await verifiedQuote(request,env,symbol);
   // Mark all held symbols with independent verified prices; missing symbols
   // are valued at historical cost, but no new quote is silently invented.
   const prices:Record<string,number>={[symbol]:quote.price};
   const next=paperOrder(wallet,symbol,side as "BUY"|"SELL",amount,quote,prices);
   if(!await updateWallet(env,who.id,next,version))
    return respond({error:"Concurrent paper order detected; refresh and retry"},409);
   return respond({wallet:next,trade:next.trades[0],exchangeOrder:false,storage:"D1"});
  }
  if(route==="paper/kill"&&request.method==="POST"){
   const body=await readJson(request,500);
   if(typeof body.enabled!=="boolean")return respond({error:"Provide boolean enabled"},400);
   const {wallet,version}=await getWallet(env,who.id);
   const next={...wallet,killSwitch:body.enabled};
   if(!await updateWallet(env,who.id,next,version))return respond({error:"Concurrent change; retry"},409);
   return respond({wallet:next});
  }
  if(route==="binance/status"&&request.method==="GET"){
   const row=await env.APEX_USERS_DB.prepare("SELECT key_fingerprint,updated_at FROM council_testnet_credentials WHERE user_id=?").bind(who.id).first<{key_fingerprint:string;updated_at:number}>();
   return respond({environment:"SPOT_TESTNET",connected:Boolean(row),fingerprint:row?.key_fingerprint??null,
     encryptionConfigured:await cryptoReady(env),ordersEnabled:false});
  }
  if(route==="binance/credentials"&&request.method==="PUT"){
   if(!await cryptoReady(env))return respond({error:"Per-user credential encryption secret not configured"},503);
   const body=await readJson(request,1700);
   const apiKey=body.apiKey,secret=body.secret;
   if(typeof apiKey!=="string"||typeof secret!=="string"||apiKey.length<16||apiKey.length>256||secret.length<24||secret.length>256)
    return respond({error:"Provide an individual Binance Spot Testnet HMAC key and secret"},400);
   // Verify account before saving: reject live/production keys and non-functional keys.
   await signed(apiKey,secret,"/api/v3/account",{},"GET");
   const encKey=await encrypt(env,who.id,apiKey),encSecret=await encrypt(env,who.id,secret);
   const now=Date.now(),fingerprint=apiKey.slice(-4);
   await env.APEX_USERS_DB.prepare("INSERT INTO council_testnet_credentials(user_id,enc_key,enc_secret,key_fingerprint,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enc_key=excluded.enc_key,enc_secret=excluded.enc_secret,key_fingerprint=excluded.key_fingerprint,updated_at=excluded.updated_at")
    .bind(who.id,encKey,encSecret,fingerprint,now).run();
   return respond({connected:true,fingerprint,environment:"SPOT_TESTNET",ordersEnabled:false});
  }
  if(route==="binance/credentials"&&request.method==="DELETE"){
   await env.APEX_USERS_DB.prepare("DELETE FROM council_testnet_credentials WHERE user_id=?").bind(who.id).run();
   return respond({connected:false});
  }
  if(route==="binance/account"&&request.method==="GET"){
   const record=await env.APEX_USERS_DB.prepare("SELECT enc_key,enc_secret FROM council_testnet_credentials WHERE user_id=?").bind(who.id).first<KeyRow>();
   if(!record)return respond({error:"Connect your own Binance Spot Testnet credentials first"},404);
   const key=await decrypt(env,who.id,record.enc_key),secret=await decrypt(env,who.id,record.enc_secret);
   const data=await signed(key,secret,"/api/v3/account",{},"GET") as {canTrade?:boolean;balances?:Array<{asset:string;free:string;locked:string}>};
   return respond({environment:"SPOT_TESTNET",canTrade:Boolean(data.canTrade),balances:(data.balances??[]).filter(x=>Number(x.free)>0||Number(x.locked)>0).slice(0,100),liveFunds:false});
  }
  if(route==="binance/order-check"&&request.method==="POST"){
   const body=await readJson(request,1000),symbol=String(body.symbol??"").toUpperCase(),amount=Number(body.amount);
   if(!SYMBOLS.has(symbol)||!Number.isFinite(amount)||amount<5||amount>25)return respond({error:"Test validation accepts configured pair and 5–25 virtual USDT"},400);
   const record=await env.APEX_USERS_DB.prepare("SELECT enc_key,enc_secret FROM council_testnet_credentials WHERE user_id=?").bind(who.id).first<KeyRow>();
   if(!record)return respond({error:"Connect Testnet credentials first"},404);
   const key=await decrypt(env,who.id,record.enc_key),secret=await decrypt(env,who.id,record.enc_secret);
   await signed(key,secret,"/api/v3/order/test",{symbol,side:"BUY",type:"MARKET",quoteOrderQty:String(amount.toFixed(2))},"POST");
   return respond({accepted:true,kind:"ORDER_VALIDATION_ONLY",orderSubmitted:false,orderFilled:false});
  }
  return respond({error:"Private route not found"},404);
 }catch(e){
  const message=e instanceof Error?e.message:"Private request failed";
  if(/Stored wallet/.test(message))return respond({error:"Paper wallet data requires administrator review"},503);
  if(/Concurrent/.test(message))return respond({error:message},409);
  if(/stale|unavailable|rejected signed|Testnet rejected|Current exchange|Market provider/.test(message))return respond({error:message},502);
  if(/Invalid|insufficient|Paper|Daily|Order|Symbol|Cannot|kill switch|exceeds|fresh|limited|size|amount|Stop/.test(message))return respond({error:message},400);
  return respond({error:"Account request failed; no credentials were disclosed"},500);
 }
}
