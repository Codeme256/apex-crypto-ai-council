/**
 * Browser-local paper Spot portfolio. This is simulated and is never sent to Binance.
 * Values persist only in this browser's localStorage; not a verified exchange account.
 */
export type PaperTrade = {id:string;at:number;symbol:string;side:"BUY"|"SELL";quantity:number;price:number;gross:number;fee:number;source:string;realizedPnl:number};
export type PaperState = {version:1;cash:number;positions:Record<string,{qty:number;cost:number}>;trades:PaperTrade[];killSwitch:boolean;startedAt:number};
export type Quote = {price:number;timestamp:number;source:string};
export const START_CASH=10000;
export const FEE_RATE=0.001;
export const MAX_ORDER_FRACTION=0.05;
export const DAILY_LOSS_FRACTION=0.02;
export const MAX_TRADES_DAY=6;
export const TRADABLE = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","SHIBUSDT","PEPEUSDT","BONKUSDT","FLOKIUSDT"] as const;
const KEY="apex-crypto-paper-v1";
export const initialPaper=():PaperState=>({version:1,cash:START_CASH,positions:{},trades:[],killSwitch:false,startedAt:Date.now()});
export function loadPaper():PaperState{
 try {
  const raw=localStorage.getItem(KEY);if(!raw)return initialPaper();
  const s=JSON.parse(raw) as PaperState;
  if(s.version!==1||!Number.isFinite(s.cash)||s.cash<0||typeof s.positions!=="object"||!Array.isArray(s.trades))return initialPaper();
  return s;
 }catch{return initialPaper();}
}
export function storePaper(s:PaperState){localStorage.setItem(KEY,JSON.stringify(s));}
export function paperEquity(s:PaperState,prices:Record<string,number>):number{
 return s.cash+Object.entries(s.positions).reduce((sum,[sym,pos])=>sum+pos.qty*(prices[sym]??pos.cost/Math.max(pos.qty,1e-12)),0);
}
function dateKey(ts:number){return new Date(ts).toISOString().slice(0,10);}
export function paperOrder(s:PaperState,symbol:string,side:"BUY"|"SELL",usdtAmount:number,
 quote:Quote,prices:Record<string,number>,now=Date.now()):PaperState{
 if(s.killSwitch)throw Error("Paper kill switch is active");
 if(!TRADABLE.includes(symbol as typeof TRADABLE[number]))throw Error("Symbol not permitted");
 if(!Number.isFinite(quote.price)||quote.price<=0||quote.timestamp>now+10000||now-quote.timestamp>45000)throw Error("Fresh verified quote required");
 if(!Number.isFinite(usdtAmount)||usdtAmount<5)throw Error("Order value must be at least 5 USDT");
 const day=dateKey(now);
 const today=s.trades.filter(x=>dateKey(x.at)===day);
 if(today.length>=MAX_TRADES_DAY)throw Error("Daily paper order limit reached");
 const equity=paperEquity(s,prices);
 if(usdtAmount>equity*MAX_ORDER_FRACTION+1e-6)throw Error("Order exceeds 5% of paper equity");
 // Reduce trading after realized losses; there is no leveraged/short execution.
 const todaysRealized=today.reduce((a,t)=>a+t.realizedPnl-t.fee,0);
 if(todaysRealized<=-START_CASH*DAILY_LOSS_FRACTION)throw Error("Paper daily realized loss limit reached");
 const fee=usdtAmount*FEE_RATE;
 const quantity=usdtAmount/quote.price;
 const previous=s.positions[symbol]??{qty:0,cost:0};
 const positions={...s.positions};
 let cash=s.cash,realizedPnl=0;
 if(side==="BUY"){
  if(cash<usdtAmount+fee)throw Error("Insufficient simulated USDT balance");
  cash-=usdtAmount+fee;
  positions[symbol]={qty:previous.qty+quantity,cost:previous.cost+usdtAmount+fee};
 }else{
  if(quantity>previous.qty+1e-10)throw Error("Cannot sell more crypto than held in this paper wallet");
  const avgCost=previous.qty>0?previous.cost/previous.qty:0;
  realizedPnl=usdtAmount-quantity*avgCost;
  cash+=usdtAmount-fee;
  const qty=Math.max(0,previous.qty-quantity);
  if(qty<1e-9)delete positions[symbol];
  else positions[symbol]={qty,cost:Math.max(0,previous.cost-quantity*avgCost)};
 }
 const trade:PaperTrade={id:crypto.randomUUID(),at:now,symbol,side,quantity,price:quote.price,gross:usdtAmount,fee,source:quote.source,realizedPnl};
 return {...s,cash,positions,trades:[trade,...s.trades].slice(0,300)};
}
