/**
 * Default fail-closed APEX risk guard for any FUTURE exchange executor.
 * Adding this function does not authorize or submit real-money orders.
 *
 * "2%" is treated as BOTH a cap on the proposed order notional and
 * the worst-case planned stop loss (including estimated fees/slippage).
 */
export type MarketType="SPOT"|"FUTURES";
export type Side="BUY"|"SELL";
export interface RiskInput{
  market:MarketType;
  side:Side;
  accountEquityUsdt:number;
  orderNotionalUsdt:number;
  entryPrice:number;
  stopPrice:number;
  leverage:number;
  estimatedRoundTripFeesPct:number;
  estimatedSlippagePct:number;
  currentOpenRiskUsdt:number;
  realizedLossTodayUsdt:number;
  realizedLossWeekUsdt:number;
  tradesToday:number;
  consecutiveLosses:number;
  authenticatedUser:boolean;
  connectedExchangeVerified:boolean;
  tradingPermissionsVerified:boolean;
  protectiveStopWillBePlaced:boolean;
  operatorEnabled:boolean;
  killSwitchActive:boolean;
}
export interface RiskResult {
  allowed:boolean;
  reasons:string[];
  limits:{maxOrderNotionalUsdt:number;maxPlannedLossUsdt:number;maxDailyLossUsdt:number;maxWeeklyLossUsdt:number};
  estimates:{plannedLossUsdt:number;combinedRiskUsdt:number};
}
const PCT=0.02;
export function evaluateLiveRisk(input:RiskInput):RiskResult{
 const reasons:string[]=[];
 const eq=input.accountEquityUsdt;
 const finite=(n:number)=>typeof n==="number"&&Number.isFinite(n);
 if(!finite(eq)||eq<=0)reasons.push("No verified positive equity from this exchange");
 const limits={
  maxOrderNotionalUsdt:finite(eq)&&eq>0?eq*PCT:0,
  maxPlannedLossUsdt:finite(eq)&&eq>0?eq*PCT:0,
  maxDailyLossUsdt:finite(eq)&&eq>0?eq*0.02:0,
  maxWeeklyLossUsdt:finite(eq)&&eq>0?eq*0.05:0
 };
 if(!input.authenticatedUser)reasons.push("Authenticated owner session required");
 if(!input.connectedExchangeVerified)reasons.push("Exchange account not verified");
 if(!input.tradingPermissionsVerified)reasons.push("Exchange trading permission not independently verified");
 if(!input.operatorEnabled)reasons.push("Owner has not authorized this execution session");
 if(input.killSwitchActive)reasons.push("Emergency kill switch active");
 if(input.market!=="SPOT"&&input.market!=="FUTURES")reasons.push("Unsupported market");
 if(input.market==="SPOT"&&input.side==="SELL")reasons.push("Spot short selling not supported");
 if(input.leverage!==1)reasons.push("Leverage must be 1x until separately audited");
 if(!finite(input.orderNotionalUsdt)||input.orderNotionalUsdt<=0||input.orderNotionalUsdt>limits.maxOrderNotionalUsdt)
  reasons.push("Per-order notional exceeds 2% of verified equity");
 if(!finite(input.entryPrice)||input.entryPrice<=0||!finite(input.stopPrice)||input.stopPrice<=0||input.entryPrice===input.stopPrice)
  reasons.push("Valid entry and stop-loss prices are mandatory");
 if(input.side==="BUY"&&input.stopPrice>=input.entryPrice)reasons.push("Buy stop-loss must be below entry");
 if(input.side==="SELL"&&input.stopPrice<=input.entryPrice)reasons.push("Sell stop-loss must be above entry");
 if(!input.protectiveStopWillBePlaced)reasons.push("Protective exchange stop order not prepared");
 if(!finite(input.estimatedRoundTripFeesPct)||input.estimatedRoundTripFeesPct<0||
    !finite(input.estimatedSlippagePct)||input.estimatedSlippagePct<0)
  reasons.push("Fee and slippage assumptions missing");
 const move=finite(input.entryPrice)&&finite(input.stopPrice)&&input.entryPrice>0?
  Math.abs(input.entryPrice-input.stopPrice)/input.entryPrice:NaN;
 const expense=input.estimatedRoundTripFeesPct+input.estimatedSlippagePct;
 const plannedLoss=move>=0&&finite(move)&&finite(expense)&&finite(input.orderNotionalUsdt)?
  input.orderNotionalUsdt*(move+expense):NaN;
 const combined=plannedLoss+input.currentOpenRiskUsdt;
 if(!finite(plannedLoss)||plannedLoss>limits.maxPlannedLossUsdt)reasons.push("Potential stop-loss exceeds 2% of equity or could not be calculated");
 if(!finite(input.currentOpenRiskUsdt)||input.currentOpenRiskUsdt<0||!finite(combined)||combined>limits.maxPlannedLossUsdt)
  reasons.push("Combined open risk exceeds 2% or is unavailable");
 if(!finite(input.realizedLossTodayUsdt)||!finite(input.realizedLossWeekUsdt)||
    input.realizedLossTodayUsdt>=limits.maxDailyLossUsdt||
    input.realizedLossWeekUsdt>=limits.maxWeeklyLossUsdt)
  reasons.push("Daily or weekly drawdown limit reached or cannot be verified");
 if(!Number.isSafeInteger(input.tradesToday)||input.tradesToday>=6)reasons.push("Daily trade limit reached");
 if(!Number.isSafeInteger(input.consecutiveLosses)||input.consecutiveLosses>=2)reasons.push("Consecutive loss pause active");
 return {
  allowed:reasons.length===0,
  reasons,
  limits,
  estimates:{
   plannedLossUsdt:finite(plannedLoss)?plannedLoss:NaN,
   combinedRiskUsdt:finite(combined)?combined:NaN
  }
 };
}
