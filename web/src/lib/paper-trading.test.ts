import {describe,it,expect} from "vitest";
import {initialPaper,paperOrder,paperEquity,MAX_TRADES_DAY} from "./paper-trading";
const at=Date.UTC(2026,10,12,11,0,0);
const prices={BTCUSDT:50000,DOGEUSDT:0.2};
describe("browser-only Spot paper wallet",()=>{
 it("starts with virtual USDT and no live Binance position",()=>{
  const state=initialPaper();expect(state.cash).toBe(10000);expect(state.trades).toHaveLength(0);
 });
 it("buys crypto and charges 0.1% simulated transaction fee",()=>{
  const s=paperOrder(initialPaper(),"DOGEUSDT","BUY",25,{price:0.2,source:"Binance Spot REST",timestamp:at},prices,at);
  expect(s.cash).toBeCloseTo(9974.975);expect(s.positions.DOGEUSDT.qty).toBe(125);
  expect(s.trades[0].source).toBe("Binance Spot REST");
 });
 it("sells only owned coins and realizes net effect correctly",()=>{
  const buy=paperOrder(initialPaper(),"DOGEUSDT","BUY",25,{price:0.2,source:"Binance Spot REST",timestamp:at},prices,at);
  const sell=paperOrder(buy,"DOGEUSDT","SELL",25,{price:0.2,source:"Binance Spot REST",timestamp:at+1000},prices,at+1000);
  expect(sell.cash).toBeCloseTo(9999.95);
  expect(sell.positions.DOGEUSDT).toBeUndefined();
 });
 it("blocks unknown pairs, stale prices, large orders and sell without holding",()=>{
  const quote={price:0.2,source:"Binance Spot REST",timestamp:at};
  expect(()=>paperOrder(initialPaper(),"FAKEUSDT","BUY",25,quote,prices,at)).toThrow("not permitted");
  expect(()=>paperOrder(initialPaper(),"DOGEUSDT","BUY",25,quote,prices,at+60000)).toThrow("Fresh");
  expect(()=>paperOrder(initialPaper(),"DOGEUSDT","BUY",1000,quote,prices,at)).toThrow("5%");
  expect(()=>paperOrder(initialPaper(),"DOGEUSDT","SELL",25,quote,prices,at)).toThrow("Cannot sell");
 });
 it("rejects orders when kill switch active",()=>{
  expect(()=>paperOrder({...initialPaper(),killSwitch:true},"DOGEUSDT","BUY",25,{price:0.2,source:"Binance",timestamp:at},prices,at)).toThrow("kill switch");
 });
 it("limits orders to six per UTC day",()=>{
  let s=initialPaper();
  for(let i=0;i<MAX_TRADES_DAY;i++)s=paperOrder(s,"DOGEUSDT","BUY",5,{price:0.2,source:"Binance",timestamp:at+i*1000},prices,at+i*1000);
  expect(s.trades).toHaveLength(6);
  expect(()=>paperOrder(s,"DOGEUSDT","BUY",5,{price:0.2,source:"Binance",timestamp:at+10000},prices,at+10000)).toThrow("Daily");
 });
 it("marks equity based on current public quote, not a fabricated exchange balance",()=>{
  const s=paperOrder(initialPaper(),"BTCUSDT","BUY",100,{price:50000,source:"Binance",timestamp:at},{BTCUSDT:50000},at);
  expect(paperEquity(s,{BTCUSDT:50000})).toBeCloseTo(9999.9);
 });
});
