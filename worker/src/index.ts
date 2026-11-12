// Cloudflare Worker API: public accounts, isolated paper portfolios and Binance Spot Testnet.
// No live-money order placement endpoints exist in this worker.
interface Env { DB: D1Database; ENCRYPTION_KEY: string; ASSETS?: Fetcher }
const json = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers}});
const te = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const rand = (n=32) => crypto.getRandomValues(new Uint8Array(n));
const sha = async (s:string) => hex(await crypto.subtle.digest("SHA-256",te.encode(s)));
const derive = async (password:string,salt:Uint8Array) => {
  const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},base,256));
};
const fromHex = (s:string) => new Uint8Array(s.match(/.{2}/g)?.map(v=>parseInt(v,16))||[]);
const cookie = (token:string,maxAge:number) => `apex_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const originOK = (request:Request) => {
  const origin=request.headers.get("origin");
  return !!origin && origin===new URL(request.url).origin;
};
async function body(request:Request):Promise<any> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON content type required");
  const raw=await request.text();
  if(raw.length>12000) throw new Error("Request too large");
  return JSON.parse(raw);
}
async function currentUser(request:Request,db:D1Database) {
  const token=request.headers.get("cookie")?.match(/(?:^|; )apex_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token) return null;
  const hash=await sha(token);
  return await db.prepare("SELECT users.id, users.email, users.created_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(hash,Date.now()).first<{id:string;email:string;created_at:number}>();
}
async function checkRate(db:D1Database,key:string,max:number,windowMs:number){
  const now=Date.now(),bucket=Math.floor(now/windowMs);
  await db.prepare("INSERT INTO rate_limits (key,bucket,hits) VALUES (?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET hits=hits+1").bind(key,bucket).run();
  const record=await db.prepare("SELECT hits FROM rate_limits WHERE key=? AND bucket=?").bind(key,bucket).first<{hits:number}>();
  return (record?.hits||0)<=max;
}
async function session(db:D1Database,userId:string) {
  const token=hex(rand());
  await db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha(token),userId,Date.now()+604800000).run();
  return cookie(token,604800);
}
async function keyFor(env:Env) {
  const raw=fromHex(env.ENCRYPTION_KEY||"");
  if(raw.length!==32) throw new Error("Server encryption key is not configured");
  return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}
async function encrypt(env:Env,text:string) {
  const iv=rand(12);
  const value=await crypto.subtle.encrypt({name:"AES-GCM",iv},await keyFor(env),te.encode(text));
  return hex(iv)+":"+hex(value);
}
async function decrypt(env:Env,encrypted:string) {
  const [iv,ct]=encrypted.split(":");
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:fromHex(iv)},await keyFor(env),fromHex(ct)));
}
async function binanceAccount(key:string,secret:string){
  const timestamp=Date.now(),params=new URLSearchParams({timestamp:String(timestamp),recvWindow:"5000"});
  const hmac=await crypto.subtle.importKey("raw",te.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=hex(await crypto.subtle.sign("HMAC",hmac,te.encode(params.toString())));
  const url="https://testnet.binance.vision/api/v3/account?"+params.toString()+"&signature="+signature;
  const abort=new AbortController(); const timeout=setTimeout(()=>abort.abort(),8000);
  try{
    const r=await fetch(url,{headers:{"X-MBX-APIKEY":key},signal:abort.signal});
    if(!r.ok) throw new Error("Binance Spot Testnet rejected these credentials (HTTP "+r.status+")");
    const data=await r.json() as {canTrade?:boolean;balances?:Array<{asset:string;free:string;locked:string}>};
    return {canTrade:!!data.canTrade,balances:(data.balances||[]).filter(b=>Number(b.free)+Number(b.locked)>0).map(b=>({asset:b.asset,free:b.free,locked:b.locked}))};
  }finally{clearTimeout(timeout)}
}
async function price(symbol:string) {
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)) throw new Error("Invalid trading symbol");
  const r=await fetch("https://api.binance.com/api/v3/ticker/price?symbol="+symbol);
  if(!r.ok) throw new Error("Market price currently unavailable");
  const data=await r.json() as {price:string};
  const p=Number(data.price);
  if(!Number.isFinite(p)||p<=0) throw new Error("Invalid exchange price");
  return p;
}
function validEmail(email:unknown):email is string {return typeof email==="string"&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function validPassword(p:unknown):p is string{return typeof p==="string"&&p.length>=12&&p.length<=128}
const fail=(message:string,status=400)=>json({error:message},status);
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith("/api/"))return env.ASSETS?env.ASSETS.fetch(request):fail("Not found",404);
  if(method==="OPTIONS")return new Response(null,{status:405});
  if(["POST","PUT","PATCH","DELETE"].includes(method)&&!originOK(request))return fail("Invalid request origin",403);
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  try{
   if(path==="/api/health"&&method==="GET")return json({status:"ok",mode:"PAPER",liveTrading:false});
   if(path==="/api/auth/register"&&method==="POST"){
    if(!await checkRate(env.DB,"register:"+ip,5,3600000))return fail("Registration rate limit exceeded",429);
    const b=await body(request),email=String(b.email||"").trim().toLowerCase(),password=b.password;
    if(!validEmail(email)||!validPassword(password))return fail("Provide a valid email and a password of 12–128 characters");
    const salt=rand(16),digest=await derive(password,salt),id=crypto.randomUUID();
    try{
     await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?)").bind(id,email,digest,hex(salt),Date.now()),
      env.DB.prepare("INSERT INTO paper_wallets(user_id,available_usdt,realized_pnl) VALUES(?,10000,0)").bind(id),
     ]);
    }catch(e){if(String(e).includes("UNIQUE"))return fail("Account already exists",409);throw e}
    return json({user:{id,email},paper:{availableUsdt:10000}},201,{"set-cookie":await session(env.DB,id)});
   }
   if(path==="/api/auth/login"&&method==="POST"){
    if(!await checkRate(env.DB,"login:"+ip,12,900000))return fail("Too many login attempts",429);
    const b=await body(request),email=String(b.email||"").trim().toLowerCase();
    const user=validEmail(email)?await env.DB.prepare("SELECT id,email,password_hash,password_salt FROM users WHERE email=?").bind(email).first<{id:string;email:string;password_hash:string;password_salt:string}>():null;
    const calculated=validPassword(b.password)?await derive(b.password,user?fromHex(user.password_salt):rand(16)):null;
    if(!user||calculated!==user.password_hash)return fail("Invalid credentials",401);
    return json({user:{id:user.id,email:user.email}},200,{"set-cookie":await session(env.DB,user.id)});
   }
   if(path==="/api/auth/logout"&&method==="POST"){
    const token=request.headers.get("cookie")?.match(/(?:^|; )apex_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(token)).run();
    return json({ok:true},200,{"set-cookie":cookie("",0)});
   }
   const user=await currentUser(request,env.DB);
   if(!user)return fail("Authentication required",401);
   if(path==="/api/auth/me"&&method==="GET")return json({user});
   if(path==="/api/paper/wallet"&&method==="GET"){
    const wallet=await env.DB.prepare("SELECT available_usdt,realized_pnl FROM paper_wallets WHERE user_id=?").bind(user.id).first();
    const positions=await env.DB.prepare("SELECT id,symbol,side,quantity,entry_price,created_at FROM paper_positions WHERE user_id=? AND status='OPEN' ORDER BY created_at DESC").bind(user.id).all();
    const history=await env.DB.prepare("SELECT id,symbol,side,quantity,fill_price,fee_usdt,created_at FROM paper_trades WHERE user_id=? ORDER BY created_at DESC LIMIT 30").bind(user.id).all();
    return json({wallet,positions:positions.results,history:history.results,mode:"PAPER"});
   }
   if(path==="/api/market/price"&&method==="GET"){
    const symbol=(url.searchParams.get("symbol")||"BTCUSDT").toUpperCase();
    return json({symbol,price:await price(symbol),source:"Binance Spot public API"});
   }
   if(path==="/api/paper/order"&&method==="POST"){
    if(!await checkRate(env.DB,"paper:"+user.id,30,60000))return fail("Order rate limit",429);
    const b=await body(request),symbol=String(b.symbol||"").toUpperCase(),side=b.side,quantity=Number(b.quantity);
    if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!symbol.endsWith("USDT")||!["BUY","SELL"].includes(side)||!Number.isFinite(quantity)||quantity<=0||quantity>1000000)return fail("Invalid Spot paper order");
    const p=await price(symbol),fee=Number((p*quantity*0.001).toFixed(8)),cost=p*quantity+fee,id=crypto.randomUUID(),now=Date.now();
    // SELL only closes an existing long position; no leverage or synthetic shorts.
    if(side==="BUY"){
      const result=await env.DB.batch([
       env.DB.prepare("UPDATE paper_wallets SET available_usdt=available_usdt-? WHERE user_id=? AND available_usdt>=?").bind(cost,user.id,cost),
       env.DB.prepare("INSERT INTO paper_positions(id,user_id,symbol,side,quantity,entry_price,status,created_at) SELECT ?,?,?,'BUY',?,?,'OPEN',? WHERE (SELECT changes())>0").bind(id,user.id,symbol,quantity,p,now)
      ]);
      if(!result[0].meta.changes||!result[1].meta.changes)return fail("Insufficient paper USDT",409);
    } else {
      const positionId=String(b.positionId||"");
      const position=await env.DB.prepare("SELECT id,quantity,entry_price FROM paper_positions WHERE id=? AND user_id=? AND symbol=? AND status='OPEN'").bind(positionId,user.id,symbol).first<{id:string;quantity:number;entry_price:number}>();
      if(!position||Math.abs(position.quantity-quantity)>1e-10)return fail("Select your own open position and its full quantity",409);
      const net=p*quantity-fee,realized=net-(position.entry_price*quantity);
      const updated=await env.DB.prepare("UPDATE paper_positions SET status='CLOSED' WHERE id=? AND user_id=? AND status='OPEN'").bind(positionId,user.id).run();
      if(!updated.meta.changes)return fail("Position already closed",409);
      await env.DB.prepare("UPDATE paper_wallets SET available_usdt=available_usdt+?,realized_pnl=realized_pnl+? WHERE user_id=?").bind(net,realized,user.id).run();
    }
    await env.DB.prepare("INSERT INTO paper_trades(id,user_id,symbol,side,quantity,fill_price,fee_usdt,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,symbol,side,quantity,p,fee,now).run();
    return json({ok:true,mode:"PAPER",symbol,side,quantity,fillPrice:p,feeUsdt:fee});
   }
   if(path==="/api/binance/testnet"&&method==="GET"){
     const found=await env.DB.prepare("SELECT connected_at FROM binance_testnet_keys WHERE user_id=?").bind(user.id).first();
     return json({connected:!!found,connectedAt:found?.connected_at||null,environment:"BINANCE_SPOT_TESTNET"});
   }
   if(path==="/api/binance/testnet"&&method==="POST"){
     if(!await checkRate(env.DB,"testnet:"+user.id,8,3600000))return fail("Connection rate limit",429);
     const b=await body(request),key=String(b.apiKey||"").trim(),secret=String(b.apiSecret||"").trim();
     if(key.length<10||key.length>200||secret.length<10||secret.length>200)return fail("Invalid API key format");
     const account=await binanceAccount(key,secret);
     const encrypted=await encrypt(env,JSON.stringify({key,secret}));
     await env.DB.prepare("INSERT INTO binance_testnet_keys(user_id,encrypted_credentials,connected_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_credentials=excluded.encrypted_credentials,connected_at=excluded.connected_at").bind(user.id,encrypted,Date.now()).run();
     return json({connected:true,environment:"BINANCE_SPOT_TESTNET",account});
   }
   if(path==="/api/binance/testnet/balances"&&method==="GET"){
     const record=await env.DB.prepare("SELECT encrypted_credentials FROM binance_testnet_keys WHERE user_id=?").bind(user.id).first<{encrypted_credentials:string}>();
     if(!record)return fail("Connect your Testnet account first",404);
     const {key,secret}=JSON.parse(await decrypt(env,record.encrypted_credentials));
     return json({environment:"BINANCE_SPOT_TESTNET",account:await binanceAccount(key,secret)});
   }
   if(path==="/api/binance/testnet"&&method==="DELETE"){
     await env.DB.prepare("DELETE FROM binance_testnet_keys WHERE user_id=?").bind(user.id).run();
     return json({connected:false});
   }
   return fail("Not found",404);
  }catch(e){const msg=e instanceof Error?e.message:"Unexpected error";
    if(msg.includes("Server encryption key"))return fail("Server configuration incomplete",503);
    if(msg.includes("Binance")||msg.includes("Market price"))return fail(msg,502);
    if(msg.includes("JSON")||msg.includes("Request too large"))return fail(msg,400);
    console.error("API error",msg);return fail("Internal server error",500)}
 }
} satisfies ExportedHandler<Env>;
