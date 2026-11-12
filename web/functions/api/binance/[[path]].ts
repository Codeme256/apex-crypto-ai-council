import { createRemoteJWKSet, jwtVerify } from "jose";
/** Private Binance SPOT TESTNET connector: no live order execution, no browser-held API keys. */
type Env={
 BINANCE_TESTNET_API_KEY?:string;BINANCE_TESTNET_SECRET_KEY?:string;
 ACCESS_TEAM_DOMAIN?:string;ACCESS_AUD?:string;ACCOUNT_OWNER_EMAIL?:string;
};
type Context={request:Request;env:Env};
const BASE="https://testnet.binance.vision";
const SYMBOLS=new Set(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","SHIBUSDT","PEPEUSDT","BONKUSDT","FLOKIUSDT"]);
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{
 status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}
});
const configured=(env:Env)=>Boolean(env.BINANCE_TESTNET_API_KEY&&env.BINANCE_TESTNET_SECRET_KEY);
const accessConfigured=(env:Env)=>Boolean(env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.ACCOUNT_OWNER_EMAIL);
async function authorize(request:Request,env:Env){
 if(!accessConfigured(env))return false;
 const team=env.ACCESS_TEAM_DOMAIN!.replace(/\/$/,"");
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team))return false;
 const jwt=request.headers.get("Cf-Access-Jwt-Assertion");
 if(!jwt)return false;
 try{
  const jwks=createRemoteJWKSet(new URL(team+"/cdn-cgi/access/certs"));
  const {payload}=await jwtVerify(jwt,jwks,{issuer:team,audience:env.ACCESS_AUD,algorithms:["RS256"]});
  return typeof payload.email==="string"&&payload.email.toLowerCase()===env.ACCOUNT_OWNER_EMAIL!.toLowerCase();
 }catch{return false;}
}
async function signed(env:Env,path:string,params:Record<string,string>,method:"GET"|"POST"){
 const body=new URLSearchParams({...params,recvWindow:"5000",timestamp:String(Date.now())}).toString();
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.BINANCE_TESTNET_SECRET_KEY!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const hash=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
 const sig=Array.from(hash,b=>b.toString(16).padStart(2,"0")).join("");
 const url=BASE+path+"?"+body+"&signature="+sig;
 const res=await fetch(url,{method,headers:{"X-MBX-APIKEY":env.BINANCE_TESTNET_API_KEY!,accept:"application/json"},signal:AbortSignal.timeout(8000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error("Binance Testnet returned HTTP "+res.status+"; check IP access, time synchronization and key permissions");
 return data;
}
export async function onRequest({request,env}:Context){
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/binance\/?/,"");
 if(route==="status"&&request.method==="GET")
  return response({environment:"SPOT_TESTNET",credentialsConfigured:configured(env),
   accessProtectionConfigured:accessConfigured(env),ordersEnabled:false,
   note:"Testnet only. Live Binance credentials are never used in this connector."});
 if(!configured(env)||!accessConfigured(env))
  return response({error:"Binance Spot Testnet is not configured. Add Testnet secrets and Cloudflare Access protection in Pages settings. Never paste keys into the site."},503);
 if(!await authorize(request,env))return response({error:"Cloudflare Access authentication required for this Binance account"},403);
 try{
  if(route==="account"&&request.method==="GET"){
   const raw=await signed(env,"/api/v3/account",{},"GET") as {canTrade?:boolean;balances?:Array<{asset:string;free:string;locked:string}>;updateTime?:number};
   return response({environment:"SPOT_TESTNET",canTrade:Boolean(raw.canTrade),
    balances:(raw.balances??[]).filter(x=>Number(x.free)>0||Number(x.locked)>0).slice(0,100),
    updatedAt:raw.updateTime??Date.now(),liveFunds:false});
  }
  if(route==="order-check"&&request.method==="POST"){
   // Validates a hypothetical market BUY against Binance filter/auth checks.
   // The /order/test endpoint never submits an order to the matching engine.
   const raw=await request.text();
   if(raw.length>1000)return response({error:"Request too large"},400);
   const input=JSON.parse(raw) as {symbol?:unknown;quoteOrderQty?:unknown};
   const symbol=String(input.symbol??"").toUpperCase();
   const amount=Number(input.quoteOrderQty);
   if(!SYMBOLS.has(symbol)||!Number.isFinite(amount)||amount<5||amount>25)
    return response({error:"Testnet validation supports configured symbols and 5–25 virtual USDT BUY amounts"},400);
   const data=await signed(env,"/api/v3/order/test",{
    symbol,side:"BUY",type:"MARKET",quoteOrderQty:String(Number(amount.toFixed(2)))
   },"POST");
   return response({environment:"SPOT_TESTNET",accepted:true,kind:"ORDER_VALIDATION_ONLY",
    orderSubmitted:false,orderFilled:false,exchangeResponse:data});
  }
  // Intentionally no real or testnet execution until audit storage and risk gates exist.
  return response({error:"Execution is not enabled. Supported: /status, /account, /order-check"},405);
 }catch(e){return response({error:e instanceof Error?e.message:"Binance testnet request failed"},502);}
}
