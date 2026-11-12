import {describe,it,expect,vi,afterEach} from "vitest";
import {onRequest} from "./[[path]]";
const env={MARKET_SYMBOLS:"BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT"};
const url=(path:string)=>new Request("https://example.pages.dev/api/"+path);
const krakenRows=Array.from({length:80},(_,i)=>[
 String(Math.floor(Date.now()/900000)*900-900*(79-i)),String(100+i),String(102+i),String(99+i),String(101+i),
 String(100+i),String(10+i),1
]);
afterEach(()=>vi.unstubAllGlobals());
describe("Cloudflare public market fallback",()=>{
 it("returns exact Kraken USDT OHLC when Binance and Coinbase both reject requests",async()=>{
  const urls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:string|URL)=>{
   const target=String(input);urls.push(target);
   if(target.includes("api.kraken.com"))return Response.json({error:[],result:{XBTUSDT:krakenRows,last:0}});
   return new Response("forbidden",{status:403});
  }));
  const res=await onRequest({request:url("klines?symbol=BTCUSDT&interval=15m&limit=75"),env});
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.source).toContain("Kraken Spot (XBTUSDT)");
  expect(body.candles.length).toBe(75);
  expect(urls.some(x=>x.includes("data-api.binance.vision"))).toBe(true);
  expect(urls.some(x=>x.includes("api.exchange.coinbase.com"))).toBe(true);
  expect(urls.some(x=>x.includes("api.kraken.com"))).toBe(true);
 });
 it("returns real Kraken ticker when other public providers are blocked",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(input:string|URL)=>{
   if(String(input).includes("api.kraken.com"))return Response.json({error:[],result:{XBTUSDT:{c:["71001.1","0.02"]}}});
   return new Response("forbidden",{status:403});
  }));
  const res=await onRequest({request:url("ticker?symbols=BTCUSDT"),env});
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.tickers[0]).toMatchObject({price:71001.1,ok:true,source:"Kraken Spot (XBTUSDT) - fallback, not Binance"});
 });
 it("never fabricates a price when all providers fail",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("forbidden",{status:403})));
  const res=await onRequest({request:url("ticker?symbols=BTCUSDT"),env});
  const body=await res.json();
  expect(body.tickers[0]).toMatchObject({price:null,ok:false});
 });
 it("strict quote-provider requests never mix other exchanges",async()=>{
  const calls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:string|URL)=>{
   const target=String(input);calls.push(target);
   if(target.includes("api.kraken.com"))return Response.json({error:[],result:{XBTUSDT:{c:["71001.1","0.02"]}}});
   return new Response("forbidden",{status:403});
  }));
  const response=await onRequest({request:url("ticker?symbols=BTCUSDT&provider=binance"),env});
  const body=await response.json();
  expect(body.tickers[0].ok).toBe(false);
  expect(calls.some(x=>x.includes("kraken.com"))).toBe(false);
 });
});
