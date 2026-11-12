import {describe,it,expect} from "vitest";
import {evaluateCouncil,type MarketCandle} from "./council-analysis";
const duration=900;
const base=Date.UTC(2026,10,12,12,0,0)/1000;
const candles:MarketCandle[]=Array.from({length:90},(_,i)=>{
 const price=100+i*.12;
 return {time:base+(i*duration),open:price-.1,high:price+.3,low:price-.3,close:price,
  volume:100+i,closed:true};
});
const now=(candles.at(-1)!.time+duration)*1000+15_000;
const args={symbol:"BTCUSDT",timeframe:"15m",source:"Binance Spot REST",retrievedAt:now,
 now,candles,quote:{price:candles.at(-1)!.close,source:"Binance Spot REST",timestamp:now-3000}};
describe("Evidence Council",()=>{
 it("generates six factual agents and does not authorize orders",()=>{
  const r=evaluateCouncil(args);
  expect(r.agents.map(x=>x.id)).toEqual(["SCOUT","TREND","MOMENTUM","SKEPTIC","RISK","COUNCIL"]);
  expect(r.indicators.rsi14).toBeGreaterThan(50);
  expect(r.dataPoints).toBe(90);
  expect(r.mode).toBe("ADVISORY_ONLY");expect(r.riskAllowed).toBe(false);
  expect(r.agents.find(x=>x.id==="RISK")?.assessment).toBe("VETO");
 });
 it("flags a stale quote and refuses to issue an executable trade",()=>{
  const r=evaluateCouncil({...args,quote:{...args.quote,timestamp:now-180000}});
  expect(r.blockers.join(" ")).toContain("stale");
  expect(r.verdict).toBe("WAIT");
  expect(r.riskAllowed).toBe(false);
 });
 it("flags different market-data sources",()=>{
  const r=evaluateCouncil({...args,quote:{...args.quote,source:"Coinbase Exchange"}});
  expect(r.blockers.join(" ")).toContain("sources differ");
 });
 it("rejects gaps in candle evidence",()=>{
  const arr=[...candles];arr.splice(20,1);
  expect(()=>evaluateCouncil({...args,candles:arr})).toThrow("Missing or irregular");
 });
 it("refuses short histories and unsupported timeframes",()=>{
  expect(()=>evaluateCouncil({...args,candles:candles.slice(-20)})).toThrow("65");
  expect(()=>evaluateCouncil({...args,timeframe:"37m"})).toThrow("Unsupported");
 });
});
