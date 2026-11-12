import { onRequest as marketApi } from "./[[path]]";
import { evaluateCouncil } from "../../src/lib/council-analysis";
type Context={request:Request;env:{MARKET_SYMBOLS?:string}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff", "access-control-allow-origin": "https://apex-ai-trade-war-room.pages.dev", "vary": "Origin"}});
const TF=new Set(["1m","5m","15m","1h","4h"]);
export async function onRequest({request,env}:Context):Promise<Response>{
 if(request.method!=="GET")return json({error:"GET only"},405);
 const url=new URL(request.url),symbol=(url.searchParams.get("symbol")??"BTCUSDT").toUpperCase();
 const timeframe=url.searchParams.get("timeframe")??"15m";
 const allowed=new Set((env.MARKET_SYMBOLS??"BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,DOGEUSDT,SHIBUSDT,PEPEUSDT,BONKUSDT,FLOKIUSDT").split(","));
 if(!allowed.has(symbol)||!TF.has(timeframe))return json({error:"Unsupported symbol or timeframe"},400);
 try{
  const candleUrl=new URL("/api/klines",url.origin);
  candleUrl.searchParams.set("symbol",symbol);candleUrl.searchParams.set("interval",timeframe);candleUrl.searchParams.set("limit","125");
  const quoteUrl=new URL("/api/ticker",url.origin);quoteUrl.searchParams.set("symbols",symbol);
  const candleResponse=await marketApi({request:new Request(candleUrl.toString()),env});
  if(!candleResponse.ok)return json({error:"Market candles unavailable; agents cannot analyze without source evidence",upstream:{candles:candleResponse.status}},503);
  const candles=await candleResponse.json() as {candles:import("../../src/lib/council-analysis").MarketCandle[];source:string;retrievedAt:number};
  // Request the current quote from the exact exchange which supplied the candles.
  // Otherwise Binance candles compared with Coinbase/Kraken prices may falsely imply momentum.
  const provider=candles.source.startsWith("Binance")?"binance":candles.source.startsWith("Coinbase")?"coinbase":candles.source.startsWith("Kraken")?"kraken":null;
  if(!provider)return json({error:"Unknown candle source; council analysis blocked"},503);
  quoteUrl.searchParams.set("provider",provider);
  const quoteResponse=await marketApi({request:new Request(quoteUrl.toString()),env});
  if(!quoteResponse.ok)return json({error:"Current quote unavailable from candle exchange",upstream:{quotes:quoteResponse.status}},503);
  const tickers=await quoteResponse.json() as {tickers:Array<{price:number|null;ok:boolean;source:string;timestamp:number}>};
  const tick=tickers.tickers[0];
  if(!candles.candles?.length)return json({error:"No verified candles available"},503);
  const result=evaluateCouncil({symbol,timeframe,source:candles.source,retrievedAt:candles.retrievedAt,
   now:Date.now(),candles:candles.candles,quote:tick?.ok&&tick.price!==null?{price:tick.price,timestamp:tick.timestamp,source:tick.source}:null});
  // Return the exact source snapshot evaluated by the agents. The UI must
  // never show Coinbase chart data beside a Binance-only council opinion.
  return json({...result,market:{symbol,interval:timeframe,source:candles.source,retrievedAt:candles.retrievedAt,candles:candles.candles}});
 }catch(error){
  return json({error:error instanceof Error?error.message:"Evidence analysis unavailable"},503);
 }
}
