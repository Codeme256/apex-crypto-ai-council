/**
 * Binance market-data adapters — Phase 1 (read-only)
 * Official public REST endpoints. No signed order endpoints.
 * Spot and USDⓈ-M Futures are separate.
 */

import type { MarketType, OHLCV, SymbolFilters, Timeframe } from "../types/index.ts";

const SPOT_BASE = "https://api.binance.com";
const FUTURES_BASE = "https://fapi.binance.com";

const TF_MAP: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

export class BinanceMarketError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "BinanceMarketError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BinanceMarketError(
      `Binance HTTP ${res.status}: ${url}`,
      res.status,
      body,
    );
  }
  return res.json() as Promise<T>;
}

function baseUrl(market: MarketType): string {
  return market === "SPOT" ? SPOT_BASE : FUTURES_BASE;
}

export async function fetchKlines(
  symbol: string,
  market: MarketType,
  timeframe: Timeframe,
  limit = 200,
): Promise<OHLCV[]> {
  const interval = TF_MAP[timeframe];
  const path =
    market === "SPOT"
      ? `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      : `/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const raw = await getJson<unknown[][]>(`${baseUrl(market)}${path}`);
  return raw.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
  }));
}

export async function fetchPrice(
  symbol: string,
  market: MarketType,
): Promise<{ price: number; timestamp: number }> {
  if (market === "SPOT") {
    const data = await getJson<{ price: string }>(
      `${SPOT_BASE}/api/v3/ticker/price?symbol=${symbol}`,
    );
    return { price: Number(data.price), timestamp: Date.now() };
  }
  const data = await getJson<{ price: string }>(
    `${FUTURES_BASE}/fapi/v1/ticker/price?symbol=${symbol}`,
  );
  return { price: Number(data.price), timestamp: Date.now() };
}

export async function fetchSymbolFilters(
  symbol: string,
  market: MarketType,
): Promise<SymbolFilters> {
  if (market === "SPOT") {
    const data = await getJson<{
      symbols: Array<{
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        filters: Array<{ filterType: string; [k: string]: string }>;
      }>;
    }>(`${SPOT_BASE}/api/v3/exchangeInfo?symbol=${symbol}`);
    const s = data.symbols[0];
    if (!s) throw new BinanceMarketError(`Symbol not found: ${symbol}`);
    return parseSpotFilters(s);
  }

  const data = await getJson<{
    symbols: Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      pricePrecision: number;
      quantityPrecision: number;
      filters: Array<{ filterType: string; [k: string]: string }>;
    }>;
  }>(`${FUTURES_BASE}/fapi/v1/exchangeInfo`);
  const s = data.symbols.find((x) => x.symbol === symbol);
  if (!s) throw new BinanceMarketError(`Futures symbol not found: ${symbol}`);
  return parseFuturesFilters(s);
}

function parseSpotFilters(s: {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  filters: Array<{ filterType: string; [k: string]: string }>;
}): SymbolFilters {
  let tickSize = 0.01;
  let stepSize = 0.001;
  let minNotional = 10;
  let minQty = 0;
  let pricePrecision = 2;
  let quantityPrecision = 3;

  for (const f of s.filters) {
    if (f.filterType === "PRICE_FILTER") {
      tickSize = Number(f.tickSize);
      pricePrecision = decimalsFromStep(tickSize);
    }
    if (f.filterType === "LOT_SIZE") {
      stepSize = Number(f.stepSize);
      minQty = Number(f.minQty);
      quantityPrecision = decimalsFromStep(stepSize);
    }
    if (f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL") {
      minNotional = Number(f.minNotional ?? f.notional ?? 10);
    }
  }

  return {
    symbol: s.symbol,
    market: "SPOT",
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    pricePrecision,
    quantityPrecision,
    tickSize,
    stepSize,
    minNotional,
    minQty,
  };
}

function parseFuturesFilters(s: {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: Array<{ filterType: string; [k: string]: string }>;
}): SymbolFilters {
  let tickSize = 0.01;
  let stepSize = 0.001;
  let minNotional = 5;
  let minQty = 0;

  for (const f of s.filters) {
    if (f.filterType === "PRICE_FILTER") tickSize = Number(f.tickSize);
    if (f.filterType === "LOT_SIZE") {
      stepSize = Number(f.stepSize);
      minQty = Number(f.minQty);
    }
    if (f.filterType === "MIN_NOTIONAL") {
      minNotional = Number(f.notional ?? 5);
    }
  }

  return {
    symbol: s.symbol,
    market: "USDT_M_FUTURES",
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    pricePrecision: s.pricePrecision,
    quantityPrecision: s.quantityPrecision,
    tickSize,
    stepSize,
    minNotional,
    minQty,
  };
}

function decimalsFromStep(step: number): number {
  if (step >= 1) return 0;
  const s = step.toFixed(12).replace(/0+$/, "");
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

export const DEFAULT_WATCHLIST = [
  { symbol: "BTCUSDT", market: "SPOT" as MarketType },
  { symbol: "ETHUSDT", market: "SPOT" as MarketType },
  { symbol: "SOLUSDT", market: "SPOT" as MarketType },
  { symbol: "BNBUSDT", market: "SPOT" as MarketType },
];
