/**
 * Per-user production Binance Spot ACCOUNT DATA ONLY.
 * No order endpoints, no withdrawals, and no API secrets returned to clients.
 * Records are encrypted separately from Testnet using user-bound AEAD.
 */
import {identity,ensureUser,respond,checkOrigin,encrypt,decrypt,cryptoReady,readJson,type Env} from "../../../_lib/security";

type Ctx={request:Request;env:Env};
type SecretRow={enc_key:string;enc_secret:string;key_fingerprint:string;updated_at:number};
type Balance={asset:string;free:string;locked:string};
const BINANCE_ORIGIN="https://api.binance.com";
const HEADERS={"cache-control":"no-store","referrer-policy":"no-referrer"} as const;

function exchangeFailure(code:number):Error {
 if(code===401||code===403)return Error("Binance production API denied account access (HTTP "+code+"). Cloudflare egress or API-key IP restrictions may block this connection. No balance is available.");
 if(code===429||code===418)return Error("Binance rate limit reached (HTTP "+code+"); retry later.");
 if(code===400)return Error("Binance rejected the signed request (HTTP 400). Check API-key permissions and server clock.");
 return Error("Binance account API unavailable (HTTP "+code+").");
}

type Permissions={
 enableReading?:boolean;
 enableSpotAndMarginTrading?:boolean;
 enableFutures?:boolean;
 enableWithdrawals?:boolean;
 enableInternalTransfer?:boolean;
 enableMargin?:boolean;
 permitsUniversalTransfer?:boolean;
 enableVanillaOptions?:boolean;
 enableFixApiTrade?:boolean;
 enablePortfolioMarginTrading?:boolean;
};
async function signedGet<T>(apiKey:string,apiSecret:string,path:string):Promise<T>{
 const params=new URLSearchParams({recvWindow:"5000",timestamp:String(Date.now())});
 const query=params.toString();
 const imported=await crypto.subtle.importKey("raw",new TextEncoder().encode(apiSecret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",imported,new TextEncoder().encode(query)));
 const signature=Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
 let response:Response;
 try{
  response=await fetch(BINANCE_ORIGIN+path+"?"+query+"&signature="+signature,{
   method:"GET",redirect:"error",headers:{"X-MBX-APIKEY":apiKey,accept:"application/json"},
   signal:AbortSignal.timeout(10000),cache:"no-store"
  });
 }catch{throw Error("Binance production API is unreachable from Cloudflare; no account data is available.");}
 if(!response.ok)throw exchangeFailure(response.status);
 if(!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
  throw Error("Binance did not return verified JSON account data.");
 return response.json() as Promise<T>;
}
async function validateReadOnlyKey(apiKey:string,apiSecret:string):Promise<void>{
 const flags=await signedGet<Permissions>(apiKey,apiSecret,"/sapi/v1/account/apiRestrictions");
 const risky=[
  "enableSpotAndMarginTrading","enableFutures","enableWithdrawals","enableInternalTransfer",
  "enableMargin","permitsUniversalTransfer","enableVanillaOptions","enableFixApiTrade","enablePortfolioMarginTrading"
 ] as const;
 if(flags.enableReading!==true||risky.some(name=>flags[name]!==false))
  throw Error("Binance key permissions are not verified READ-ONLY. Remove all trading, transfer and withdrawal privileges before connecting.");
}
async function spotAccount(apiKey:string,apiSecret:string):Promise<{balances:Balance[];accountType:string;observedAt:number;source:string}>{
 // Recheck permissions on every balance read in case the owner changed them.
 await validateReadOnlyKey(apiKey,apiSecret);
 const data=await signedGet<{accountType?:unknown;balances?:unknown}>(apiKey,apiSecret,"/api/v3/account");
 if(!Array.isArray(data.balances)||typeof data.accountType!=="string")
  throw Error("Binance returned an invalid account response.");
 const balances:Balance[]=data.balances.filter((x:unknown)=>{
  if(typeof x!=="object"||x===null)return false;
  const v=x as Balance;
  return typeof v.asset==="string"&&/^[A-Z0-9]{2,20}$/.test(v.asset)&&
    typeof v.free==="string"&&typeof v.locked==="string"&&
    Number.isFinite(Number(v.free))&&Number.isFinite(Number(v.locked))&&
    Number(v.free)>=0&&Number(v.locked)>=0&&(Number(v.free)>0||Number(v.locked)>0);
 }).slice(0,100);
 return {balances,accountType:data.accountType,observedAt:Date.now(),source:"Binance production signed Spot account API"};
}

export async function onRequest({request,env}:Ctx):Promise<Response>{
 const route=new URL(request.url).pathname.replace(/^\/api\/private\/spot\/?/,"").replace(/\/$/,"");
 if(!env.APEX_USERS_DB)return respond({error:"Account database not configured"},503);
 const who=await identity(request,env);
 if(!who)return respond({error:"Sign in with your personal APEX email account"},401);
 if(!["GET","PUT","DELETE"].includes(request.method))return respond({error:"Method not allowed"},405);
 if(request.method!=="GET"&&!checkOrigin(request))return respond({error:"Invalid request origin"},403);
 try {
  await ensureUser(env.APEX_USERS_DB,who,Date.now());
  if(route==="status"&&request.method==="GET"){
   const row=await env.APEX_USERS_DB.prepare("SELECT key_fingerprint,updated_at FROM council_live_spot_credentials WHERE user_id=?").bind(who.id).first<{key_fingerprint:string;updated_at:number}>();
   return respond({connected:Boolean(row),fingerprint:row?.key_fingerprint??null,readOnly:true,
     environment:"BINANCE_SPOT_PRODUCTION",encryptionConfigured:await cryptoReady(env),
     note:"Only a signed account GET is supported; no live orders, futures or withdrawals."});
  }
  if(route==="credentials"&&request.method==="PUT"){
   if(!await cryptoReady(env))return respond({error:"Encryption secret unavailable; no credentials saved"},503);
   const body=await readJson(request,1800);
   const apiKey=body.apiKey,secret=body.secret;
   if(typeof apiKey!=="string"||typeof secret!=="string"||
     apiKey.length<16||apiKey.length>256||secret.length<24||secret.length>256)
     return respond({error:"Enter your own Binance production Spot read-only HMAC API key and secret."},400);
   // Verify against live Binance signed account endpoint BEFORE writing any secret.
   await spotAccount(apiKey,secret);
   const [encKey,encSecret]=await Promise.all([
     encrypt(env,who.id,apiKey,"live-spot"),encrypt(env,who.id,secret,"live-spot")
   ]);
   const fingerprint=apiKey.slice(-4);
   await env.APEX_USERS_DB.prepare(
     "INSERT INTO council_live_spot_credentials(user_id,enc_key,enc_secret,key_fingerprint,updated_at) VALUES(?,?,?,?,?) "+
     "ON CONFLICT(user_id) DO UPDATE SET enc_key=excluded.enc_key,enc_secret=excluded.enc_secret,key_fingerprint=excluded.key_fingerprint,updated_at=excluded.updated_at"
   ).bind(who.id,encKey,encSecret,fingerprint,Date.now()).run();
   return respond({connected:true,environment:"BINANCE_SPOT_PRODUCTION",fingerprint,readOnly:true});
  }
  if(route==="credentials"&&request.method==="DELETE"){
   await env.APEX_USERS_DB.prepare("DELETE FROM council_live_spot_credentials WHERE user_id=?").bind(who.id).run();
   return respond({connected:false,readOnly:true});
  }
  if(route==="account"&&request.method==="GET"){
   const row=await env.APEX_USERS_DB.prepare("SELECT enc_key,enc_secret,key_fingerprint,updated_at FROM council_live_spot_credentials WHERE user_id=?").bind(who.id).first<SecretRow>();
   if(!row)return respond({error:"Connect your personal Binance Spot production read-only key first"},404);
   const [apiKey,secret]=await Promise.all([
     decrypt(env,who.id,row.enc_key,"live-spot"),decrypt(env,who.id,row.enc_secret,"live-spot")
   ]);
   const account=await spotAccount(apiKey,secret);
   return respond({...account,liveFunds:true,environment:"BINANCE_SPOT_PRODUCTION",readOnly:true});
  }
  return respond({error:"Private route not found"},404);
 }catch(e){
   const message=e instanceof Error?e.message:"Account request failed";
   if(/Binance|rate limit|signed|JSON|account response|API-key|egress|server clock/i.test(message))
     return respond({error:message},502);
   if(/Invalid|secret|encryption|credentials|not configured/i.test(message))
     return respond({error:"Unable to verify or encrypt production credentials; no API key was saved"},503);
   // Do not reveal SQL schemas or cryptographic failures.
   return respond({error:"Binance account request failed; no credentials disclosed"},503);
 }
}
