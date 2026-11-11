const API_BASE =
  (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ||
  "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type Mode = "PAPER" | "READ_ONLY" | "SPOT_LIVE" | "FUTURES_LIVE";

export interface Health {
  service: string;
  version: string;
  overall: string;
  modeDefault: string;
  timestamp: number;
  live: {
    spotAuthActive: boolean;
    futuresAuthActive: boolean;
    killSwitch: boolean;
    circuitBreaker: boolean;
  };
}

export interface Portfolio {
  mode: Mode;
  equity: number;
  available: number;
  dailyPnl: number;
  weeklyPnl: number;
  openPositions: number;
  consecutiveLosses: number;
  circuitBreakerActive: boolean;
  killSwitchActive: boolean;
  timestamp: number;
}

export interface AgentReport {
  agent: string;
  summary: string;
  confidence?: number;
  advisoryVeto?: boolean;
  objections?: string[];
  latencyMs?: number;
  ok?: boolean;
}

export interface ScanResult {
  candidate: {
    id: string;
    symbol: string;
    market: string;
    side: string;
    timeframe: string;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    rewardRisk: number;
    status: string;
    scoutScore?: number;
  } | null;
  decision: { decision: string; rationale: string; timestamp?: number } | null;
  reports: AgentReport[];
  riskAllowed: boolean;
  riskReasons: string[];
  paperPositionId?: string;
  error?: string;
  portfolio?: Portfolio;
}

export const api = {
  health: () => req<Health>("/health"),
  portfolio: () => req<Portfolio>("/portfolio"),
  scan: (body: { symbol: string; market?: string; timeframe?: string }) =>
    req<ScanResult>("/scan", { method: "POST", body: JSON.stringify(body) }),
  councilTick: () =>
    req<unknown>("/council/tick", { method: "POST", body: "{}" }),
  ticker: (symbols?: string[]) => {
    const q = symbols?.length ? `?symbols=${symbols.join(",")}` : "";
    return req<{ tickers: Array<{ symbol: string; price: number | null; ok: boolean }> }>(`/ticker${q}`);
  },
  backtest: (symbol: string) =>
    req<unknown>("/backtest", {
      method: "POST",
      body: JSON.stringify({ symbol, candleLimit: 300 }),
    }),
};
