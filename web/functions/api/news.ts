/**
 * Verified, source-linked cryptocurrency headlines.
 * No LLM summaries, synthetic stories, investment recommendations, or price forecasts.
 * Uses a small allowlist of public RSS feeds and caches response for 5 minutes.
 */
type Ctx={request:Request};
type Source={name:string;host:string;url:string};
const SOURCES:Source[]=[
 {name:"CoinDesk",host:"www.coindesk.com",url:"https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml"},
 {name:"Cointelegraph",host:"cointelegraph.com",url:"https://cointelegraph.com/rss"},
 {name:"Decrypt",host:"decrypt.co",url:"https://decrypt.co/feed"},
 {name:"The Block",host:"www.theblock.co",url:"https://www.theblock.co/rss.xml"}
];
const KNOWN=new Set(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","SHIBUSDT","PEPEUSDT","BONKUSDT","FLOKIUSDT"]);
const TERMS:Record<string,string[]>={
 BTCUSDT:["bitcoin","btc","satoshi"],
 ETHUSDT:["ethereum","ether","eth "],
 SOLUSDT:["solana","sol token","sol "],
 BNBUSDT:["binance","bnb","bsc"],
 DOGEUSDT:["dogecoin","doge"],
 SHIBUSDT:["shiba inu","shib"],
 PEPEUSDT:["pepe"],
 BONKUSDT:["bonk"],
 FLOKIUSDT:["floki"]
};
export type NewsArticle={title:string;url:string;source:string;publishedAt:number;relevance:"SYMBOL"|"MARKET";symbol:string};
export type NewsResponse={symbol:string;retrievedAt:number;items:NewsArticle[];sourcesAvailable:string[];sourcesUnavailable:string[];status:"OK"|"DEGRADED";note:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=300, stale-while-revalidate=60","x-content-type-options":"nosniff"}
});
const clean=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
 .replace(/&#x([a-f0-9]+);/gi,(_,x:string)=>String.fromCodePoint(parseInt(x,16)))
 .replace(/&#([0-9]+);/g,(_,x:string)=>String.fromCodePoint(parseInt(x,10)))
 .replace(/&(amp|lt|gt|quot|apos|#39);/gi,(_,x:string)=>{
  const m:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'", "#39":"'"};
  return m[x.toLowerCase()]||"";
 }).replace(/<[^>]*>/g,"").trim();
function child(xml:string,tag:string):string{
 const m=xml.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"));
 return m?clean(m[1]):"";
}
function parseFeed(xml:string,source:Source,now:number,symbol:string):NewsArticle[]{
 if(!xml.includes("<rss")&&!xml.includes("<feed"))throw Error("Not an RSS feed");
 const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)??[];
 const articles:NewsArticle[]=[];
 for(const item of items.slice(0,40)){
  const title=child(item,"title").slice(0,230);
  const rawUrl=child(item,"link");
  const timestamp=Date.parse(child(item,"pubDate")||child(item,"published")||"");
  if(!title||!rawUrl||!Number.isFinite(timestamp)||timestamp>now+300_000||now-timestamp>7*86400_000)continue;
  let uri:URL;
  try {uri=new URL(rawUrl);}catch{continue;}
  // Never include untrusted javascript: URLs or publisher-impersonation domains.
  if(uri.protocol!=="https:"||!(uri.hostname===source.host||uri.hostname===source.host.replace(/^www\./,"")||uri.hostname==="www."+source.host))continue;
  const hit=TERMS[symbol].some(t=>(" "+title.toLowerCase()+" ").includes(t));
  articles.push({title,url:uri.toString(),source:source.name,publishedAt:timestamp,relevance:hit?"SYMBOL":"MARKET",symbol});
 }
 return articles;
}
async function fromSource(source:Source,now:number,symbol:string):Promise<NewsArticle[]>{
 const response=await fetch(source.url,{method:"GET",headers:{accept:"application/rss+xml, application/xml, text/xml;q=0.9", "user-agent":"APEXCryptoCouncil/1.0 public RSS reader"},signal:AbortSignal.timeout(6500),redirect:"follow"});
 if(!response.ok)throw Error("Source HTTP "+response.status);
 const type=response.headers.get("content-type")||"";
 if(type.includes("text/html"))throw Error("Feed returned HTML instead of RSS");
 const txt=await response.text();
 if(txt.length>1_500_000)throw Error("Feed too large");
 const articles=parseFeed(txt,source,now,symbol);
 if(!articles.length)throw Error("No fresh verifiable source headlines");
 return articles;
}
export async function onRequest({request}:Ctx):Promise<Response>{
 if(request.method!=="GET")return json({error:"GET only"},405);
 const symbol=(new URL(request.url).searchParams.get("symbol")||"BTCUSDT").toUpperCase();
 if(!KNOWN.has(symbol))return json({error:"Unsupported news symbol"},400);
 const now=Date.now();
 const results=await Promise.allSettled(SOURCES.map(s=>fromSource(s,now,symbol)));
 const good:string[]=[],bad:string[]=[],all:NewsArticle[]=[];
 results.forEach((r,i)=>{
  if(r.status==="fulfilled"){good.push(SOURCES[i].name);all.push(...r.value);}
  else bad.push(SOURCES[i].name);
 });
 if(!good.length)return json({error:"Verified cryptocurrency RSS feeds are temporarily unavailable",symbol,sourcesUnavailable:bad},503);
 const unique=new Map<string,NewsArticle>();
 for(const item of all){
  const normalized=item.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,65);
  const prev=unique.get(normalized);
  if(!prev||item.publishedAt>prev.publishedAt)unique.set(normalized,item);
 }
 const items=[...unique.values()].sort((a,b)=>
  (a.relevance===b.relevance?0:a.relevance==="SYMBOL"?-1:1)||(b.publishedAt-a.publishedAt)).slice(0,15);
 const body:NewsResponse={symbol,retrievedAt:now,items,sourcesAvailable:good,sourcesUnavailable:bad,status:bad.length?"DEGRADED":"OK",
  note:"Sourced publisher headlines only. Relevance is a keyword match, not sentiment or a prediction. Source timestamps may lag market prices."};
 return json(body);
}
