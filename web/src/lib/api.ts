const API_BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type Mode = "PAPER" | "READ_ONLY" | "SPOT_LIVE" | "FUTURES_LIVE";
export interface Health {
  service: string; version: string; overall: string; modeDefault: string; timestamp: number;
  live: { spotAuthActive: boolean; futuresAuthActive: boolean; killSwitch: boolean; circuitBreaker: boolean };
  capabilities?: { publicMarketData: boolean; portfolio: boolean; agents: boolean; paperExecution: boolean; liveExecution: boolean };
}
export interface Portfolio {
  mode: Mode; equity: number; available: number; dailyPnl: number; weeklyPnl: number;
  openPositions: number; consecutiveLosses: number; circuitBreakerActive: boolean;
  killSwitchActive: boolean; timestamp: number;
}
export interface AgentReport {
  agent: string; summary: string; confidence?: number; advisoryVeto?: boolean;
  objections?: string[]; latencyMs?: number; ok?: boolean;
}
export interface ScanResult {
  candidate: { id: string; symbol: string; market: string; side: string; timeframe: string; entry: number; stopLoss: number; takeProfit: number; rewardRisk: number; status: string; scoutScore?: number } | null;
  decision: { decision: string; rationale: string; timestamp?: number } | null;
  reports: AgentReport[]; riskAllowed: boolean; riskReasons: string[];
  paperPositionId?: string; error?: string; portfolio?: Portfolio;
}
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean }
export interface CandleResponse { symbol: string; interval: string; source: string; retrievedAt: number; candles: Candle[] }

export interface BinanceConnectionStatus {environment:string;credentialsConfigured:boolean;accessProtectionConfigured:boolean;ordersEnabled:boolean;note:string}
export interface BinanceTestnetAccount {environment:string;canTrade:boolean;balances:Array<{asset:string;free:string;locked:string}>;updatedAt:number;liveFunds:boolean}
export interface CouncilAgent {id:string;role:string;state:"COMPLETE"|"BLOCKED";assessment:"BULLISH"|"BEARISH"|"NEUTRAL"|"VETO";summary:string;observations:string[];latencyMs:number}
export interface CouncilReport {
 symbol:string;timeframe:string;source:string;asOf:number;lastCandleTime:number;
 mode:"ADVISORY_ONLY";model:string;bias:"BULLISH"|"BEARISH"|"NEUTRAL";verdict:"WATCH"|"WAIT";riskAllowed:false;
 quote:{price:number;timestamp:number;source:string}|null;
 indicators:{ema20:number;ema50:number;rsi14:number;atr14:number;volumeRatio:number;volatilityPercent:number};
 agents:CouncilAgent[];blockers:string[];dataPoints:number;
 market?:CandleResponse;
}
export interface NewsArticle {title:string;url:string;source:string;publishedAt:number;relevance:"SYMBOL"|"MARKET";symbol:string}
export interface NewsResponse {symbol:string;retrievedAt:number;items:NewsArticle[];sourcesAvailable:string[];sourcesUnavailable:string[];status:"OK"|"DEGRADED";note:string}
export interface CouncilUser {id:string;email:string}
export interface PrivatePaperState {wallet:import("./paper-trading").PaperState;version:number|null;storage:string}
export interface PersonalBinanceStatus {environment:string;connected:boolean;fingerprint:string|null;encryptionConfigured:boolean;ordersEnabled:false}
export interface LiveSpotStatus {environment:"BINANCE_SPOT_PRODUCTION";connected:boolean;fingerprint:string|null;encryptionConfigured:boolean;readOnly:true;note?:string}
export interface LiveSpotAccount {environment:"BINANCE_SPOT_PRODUCTION";liveFunds:true;readOnly:true;source:string;observedAt:number;accountType:string;balances:Array<{asset:string;free:string;locked:string}>}
export const api = {
  health: () => req<Health>("/health"),
  news: (symbol:string) => req<NewsResponse>(`/news?symbol=${encodeURIComponent(symbol)}`),
  council: (symbol:string,timeframe:string) => req<CouncilReport>(`/council?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`),
  emailSignup:(email:string,password:string)=>req<{user:CouncilUser}>("/auth/register",{method:"POST",body:JSON.stringify({email,password})}),
  emailLogin:(email:string,password:string)=>req<{user:CouncilUser}>("/auth/login",{method:"POST",body:JSON.stringify({email,password})}),
  logout:()=>req<{ok:boolean}>("/auth/logout",{method:"POST",body:"{}"}),
  registerOrLogin:()=>req<{user:CouncilUser;registered:boolean}>("/private/me"),
  privatePaper:()=>req<PrivatePaperState>("/private/paper"),
  privatePaperOrder:(symbol:string,side:"BUY"|"SELL",amount:number)=>req<{wallet:import("./paper-trading").PaperState;exchangeOrder:false}>("/private/paper/orders",{method:"POST",body:JSON.stringify({symbol,side,amount})}),
  privatePaperKill:(enabled:boolean)=>req<{wallet:import("./paper-trading").PaperState}>("/private/paper/kill",{method:"POST",body:JSON.stringify({enabled})}),
  liveSpotStatus:()=>req<LiveSpotStatus>("/private/spot/status"),
  liveSpotAccount:()=>req<LiveSpotAccount>("/private/spot/account"),
  saveLiveSpotKey:(apiKey:string,secret:string)=>req<{connected:true;readOnly:true}>("/private/spot/credentials",{method:"PUT",body:JSON.stringify({apiKey,secret})}),
  disconnectLiveSpot:()=>req<{connected:false}>("/private/spot/credentials",{method:"DELETE",body:"{}"}),
  binanceStatus:()=>req<PersonalBinanceStatus>("/private/binance/status"),
  binanceAccount:()=>req<BinanceTestnetAccount>("/private/binance/account"),
  saveTestnetCredentials:(apiKey:string,secret:string)=>req<{connected:boolean;fingerprint:string}>("/private/binance/credentials",{method:"PUT",body:JSON.stringify({apiKey,secret})}),
  disconnectTestnet:()=>req<{connected:false}>("/private/binance/credentials",{method:"DELETE",body:"{}"}),
  binanceOrderCheck:(symbol:string,amount:number)=>req<{accepted:boolean;orderSubmitted:false}>("/private/binance/order-check",{method:"POST",body:JSON.stringify({symbol,amount})}),
  portfolio: () => req<Portfolio>("/portfolio"),
  scan: (body: { symbol: string; market?: string; timeframe?: string }) => req<ScanResult>("/scan", { method: "POST", body: JSON.stringify(body) }),
  councilTick: () => req<unknown>("/council/tick", { method: "POST", body: "{}" }),
  ticker: (symbols?: string[]) => {
    const q = symbols?.length ? `?symbols=${symbols.map(encodeURIComponent).join(",")}` : "";
    return req<{ tickers: Array<{ symbol: string; price: number | null; ok: boolean; source?: string; timestamp?: number }> }>(`/ticker${q}`);
  },
  candles: (symbol: string, interval: string, limit = 300) => req<CandleResponse>(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`),
  backtest: (symbol: string) => req<unknown>("/backtest", { method: "POST", body: JSON.stringify({ symbol, candleLimit: 300 }) }),
};
