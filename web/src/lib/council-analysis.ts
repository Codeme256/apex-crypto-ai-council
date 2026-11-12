/** APEX Evidence Council
 * Real, explainable quantitative agent reports. No LLM credentials, invented
 * AI dialogue, predictive certainty, or broker orders. Inspired by ECC's
 * evidence-first review + independent skeptic/risk checks; REA is a reverse-
 * engineering tool and is not a market-analysis model.
 */
export type MarketCandle={time:number;open:number;high:number;low:number;close:number;volume:number;closed:boolean};
export type EvidenceAgent={id:"SCOUT"|"TREND"|"MOMENTUM"|"SKEPTIC"|"RISK"|"COUNCIL";role:string;
 state:"COMPLETE"|"BLOCKED";assessment:"BULLISH"|"BEARISH"|"NEUTRAL"|"VETO";
 summary:string;observations:string[];latencyMs:number};
export type CouncilResult={symbol:string;timeframe:string;source:string;asOf:number;lastCandleTime:number;
 quote:{price:number;timestamp:number;source:string}|null;mode:"ADVISORY_ONLY";model:"Deterministic technical analysis (no external LLM)";
 bias:"BULLISH"|"BEARISH"|"NEUTRAL";verdict:"WATCH"|"WAIT";riskAllowed:false;
 indicators:{ema20:number;ema50:number;rsi14:number;atr14:number;volumeRatio:number;volatilityPercent:number};
 agents:EvidenceAgent[];blockers:string[];dataPoints:number};
const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;
function ema(values:number[],period:number){let e=mean(values.slice(0,period));const k=2/(period+1);
 for(const v of values.slice(period))e=v*k+e*(1-k);return e;}
function rsi(values:number[],period=14){let gain=0,loss=0;
 for(let i=values.length-period;i<values.length;i++){const d=values[i]-values[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}
 if(loss===0)return gain>0?100:50;return 100-100/(1+gain/loss);}
function atr(candles:MarketCandle[],period=14){let sum=0;
 for(let i=candles.length-period;i<candles.length;i++){
  const c=candles[i],previous=candles[i-1].close;
  sum+=Math.max(c.high-c.low,Math.abs(c.high-previous),Math.abs(c.low-previous));
 }return sum/period;}
export function evaluateCouncil(args:{symbol:string;timeframe:string;source:string;retrievedAt:number;now:number;
 candles:MarketCandle[];quote:{price:number;timestamp:number;source:string}|null}):CouncilResult{
 const {symbol,timeframe,source,now,quote}=args;
 const duration=({"1m":60,"5m":300,"15m":900,"1h":3600,"4h":14400} as Record<string,number>)[timeframe];
 if(!duration)throw new Error("Unsupported evidence timeframe");
 const values=args.candles.filter(c=>c.closed&&[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&
  c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.volume>=0)
  .sort((a,b)=>a.time-b.time).slice(-130);
 if(values.length<65)throw new Error("At least 65 verified closed candles are required");
 const gaps=values.some((c,i)=>i>0&&c.time-values[i-1].time!==duration);
 const last=values.at(-1)!;
 const closes=values.map(c=>c.close),volumes=values.map(c=>c.volume);
 const ema20=ema(closes,20),ema50=ema(closes,50),rsi14=rsi(closes),atr14=atr(values);
 const avgVolume=mean(volumes.slice(-21,-1)),volumeRatio=avgVolume>0?last.volume/avgVolume:0;
 const volatilityPercent=atr14/last.close*100;
 const trend:CouncilResult["bias"]=ema20>ema50&&last.close>ema20?"BULLISH":ema20<ema50&&last.close<ema20?"BEARISH":"NEUTRAL";
 const blockers:string[]=[];
 if(gaps)blockers.push("Missing or irregular candle intervals; indicators are indicative only and any trade is blocked");
 const staleCandle=now-(last.time+duration)*1000>Math.max(2*duration*1000,15*60000);
 if(staleCandle||last.time*1000>now)blockers.push("Closed candle data stale or future-dated");
 if(!quote||!Number.isFinite(quote.price)||quote.price<=0||now-quote.timestamp>90000||quote.timestamp>now+10000)
  blockers.push("Current verified quote unavailable or stale");
 if(quote&&quote.source!==source)blockers.push("Candle and quote sources differ; comparisons unreliable");
 if(quote&&Math.abs(quote.price-last.close)/last.close>0.025)blockers.push("Quote and last closed price differ by over 2.5%");
 if(volatilityPercent>6)blockers.push("Extremely high ATR volatility relative to price");
 if(volumeRatio===0)blockers.push("Unavailable or zero reference volume");
 blockers.push("Spread, order-book liquidity, slippage and exchange trading filters not independently verified");
 const stamp=Date.now();
 const make=(id:EvidenceAgent["id"],role:string,assessment:EvidenceAgent["assessment"],summary:string,observations:string[],blocked=false):EvidenceAgent=>({
  id,role,state:blocked?"BLOCKED":"COMPLETE",assessment,summary,observations,latencyMs:Math.max(0,Date.now()-stamp)});
 const scout=make("SCOUT","Price structure",trend,
  trend==="NEUTRAL"?"Price is not consistently aligned with both moving averages.":`Last close is ${trend.toLowerCase()} relative to EMA20 and EMA50.`,
  [`Closed M${duration/60} bars: ${values.length}`,`Last close: ${last.close.toPrecision(7)}`,`EMA20: ${ema20.toPrecision(7)} / EMA50: ${ema50.toPrecision(7)}`]);
 const trendAgent=make("TREND","Trend validation",trend,`EMA20 / EMA50 evidence indicates ${trend.toLowerCase()} bias, not a price forecast.`,
  [`EMA gap: ${((ema20-ema50)/ema50*100).toFixed(3)}%`,`Closed candle timestamp: ${new Date((last.time+duration)*1000).toISOString()}`]);
 const momentumBias=rsi14>=60?"BULLISH":rsi14<=40?"BEARISH":"NEUTRAL";
 const momentum=make("MOMENTUM","Momentum and activity",momentumBias,
  `RSI14 ${rsi14.toFixed(1)}; last completed volume ${volumeRatio.toFixed(2)}x prior 20-candle average.`,
  [`RSI14: ${rsi14.toFixed(1)}`,`Relative volume: ${volumeRatio.toFixed(2)}x`]);
 const skeptic=make("SKEPTIC","Counterargument",blockers.length?"VETO":"NEUTRAL",
   blockers.length?"Risk evidence is incomplete; do not treat this as an executable signal.":"Technicals alone do not establish a tradeable edge.",
   [`ATR14: ${atr14.toPrecision(7)} (${volatilityPercent.toFixed(2)}% of price)`,
    "No exchange depth, spread or real execution-price verification","Technical correlation does not imply profitability"]);
 const risk=make("RISK","Execution eligibility","VETO",
  "Trade execution is blocked; market evidence is informational and no orders are authorized.",
  [...blockers,"Broker order execution and independent risk checks are disabled"],true);
 const decision=(trend!=="NEUTRAL"&&trend===momentumBias&&blockers.length===1&&!staleCandle)?"WATCH":"WAIT";
 const council=make("COUNCIL","Evidence synthesis",decision==="WATCH"?trend:"NEUTRAL",
  decision==="WATCH"?"Directional WATCH only. Verify liquidity, spread and retest manually.":"WAIT. Independent evidence is mixed, stale or incomplete.",
  [`Trend: ${trend}; RSI momentum: ${momentumBias}`,`Decision: ${decision}; never an order instruction`]);
 return {symbol,timeframe,source,asOf:now,lastCandleTime:(last.time+duration)*1000,quote,
  mode:"ADVISORY_ONLY",model:"Deterministic technical analysis (no external LLM)",bias:trend,
  verdict:decision,riskAllowed:false,
  indicators:{ema20,ema50,rsi14,atr14,volumeRatio,volatilityPercent},
  agents:[scout,trendAgent,momentum,skeptic,risk,council],blockers,dataPoints:values.length};
}
