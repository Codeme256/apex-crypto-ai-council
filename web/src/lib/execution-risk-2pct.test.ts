import {describe,it,expect} from "vitest";
import {evaluateLiveRisk,type RiskInput} from "./execution-risk-2pct";

const valid:RiskInput={
  market:"SPOT",side:"BUY",accountEquityUsdt:1000,
  orderNotionalUsdt:18,entryPrice:100,stopPrice:95,leverage:1,
  estimatedRoundTripFeesPct:0.002,estimatedSlippagePct:0.003,
  currentOpenRiskUsdt:0,realizedLossTodayUsdt:0,realizedLossWeekUsdt:0,
  tradesToday:0,consecutiveLosses:0,authenticatedUser:true,
  connectedExchangeVerified:true,tradingPermissionsVerified:true,
  protectiveStopWillBePlaced:true,operatorEnabled:true,killSwitchActive:false
};
describe("APEX live risk preflight — maximum 2%",()=>{
 it("allows only complete valid hypothetical risk inputs",()=>expect(evaluateLiveRisk(valid).allowed).toBe(true));
 it("caps order notional at 2% of verified equity",()=>{
  const result=evaluateLiveRisk({...valid,orderNotionalUsdt:20.01});
  expect(result.allowed).toBe(false);
  expect(result.limits.maxOrderNotionalUsdt).toBe(20);
 });
 it("refuses missing owner authorization and exchange trading permissions",()=>{
  const r=evaluateLiveRisk({...valid,operatorEnabled:false,tradingPermissionsVerified:false});
  expect(r.allowed).toBe(false);
  expect(r.reasons).toContain("Owner has not authorized this execution session");
 });
 it("rejects all positions without an exchange protective stop",()=>{
  expect(evaluateLiveRisk({...valid,protectiveStopWillBePlaced:false}).allowed).toBe(false);
 });
 it("refuses leveraged futures before separate validation",()=>{
  expect(evaluateLiveRisk({...valid,market:"FUTURES",side:"SELL",stopPrice:110,leverage:10}).allowed).toBe(false);
 });
 it("stops after two consecutive losses and six trades",()=>{
  expect(evaluateLiveRisk({...valid,tradesToday:6,consecutiveLosses:2}).allowed).toBe(false);
 });
 it("rejects missing exchange equity, NaN inputs and combined-risk breaches",()=>{
  expect(evaluateLiveRisk({...valid,accountEquityUsdt:NaN}).allowed).toBe(false);
  expect(evaluateLiveRisk({...valid,currentOpenRiskUsdt:21}).allowed).toBe(false);
 });
});
