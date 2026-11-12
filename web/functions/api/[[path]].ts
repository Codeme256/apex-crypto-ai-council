const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
const BINANCE = "https://api.binance.com";

type Env = { MARKET_SYMBOLS?: string };
type PagesContext = { request: Request; env: Env };
const json = (value: unknown, status = 200, cache = "no-store") => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff" },
});

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const allowed = new Set((env.MARKET_SYMBOLS || DEFAULT_SYMBOLS.join(",")).split(",").map(s => s.trim().toUpperCase()).filter(Boolean));
  if (route === "health") {
    return json({ service: "apex-market-api", version: "1.0.0", overall: "healthy", modeDefault: "READ_ONLY", timestamp: Date.now(), live: { spotAuthActive: false, futuresAuthActive: false, killSwitch: true, circuitBreaker: false }, capabilities: { publicMarketData: true, portfolio: false, agents: false, paperExecution: false, liveExecution: false } });
  }
  try {
    if (route === "ticker") {
      const requested = url.searchParams.get("symbols")?.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) ?? [...allowed];
      if (!requested.length || requested.length > 20 || requested.some(s => !allowed.has(s))) return json({ error: "Use up to 20 configured market symbols" }, 400);
      const tickers = await Promise.all(requested.map(async symbol => {
        try {
          const response = await fetch(`${BINANCE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8_000) });
          if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
          const data = await response.json() as { price?: string };
          const price = Number(data.price);
          return { symbol, price: Number.isFinite(price) ? price : null, ok: Number.isFinite(price), source: "Binance Spot REST", timestamp: Date.now() };
        } catch { return { symbol, price: null, ok: false, source: "Binance Spot REST", timestamp: Date.now() }; }
      }));
      return json({ tickers }, 200, "public, max-age=3, stale-while-revalidate=5");
    }
    if (route === "klines") {
      const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
      const interval = url.searchParams.get("interval") || "15m";
      const limit = Number(url.searchParams.get("limit") || 200);
      if (!allowed.has(symbol)) return json({ error: "Symbol is not configured" }, 400);
      if (!INTERVALS.has(interval)) return json({ error: "Unsupported candle interval" }, 400);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return json({ error: "limit must be an integer from 1 to 1000" }, 400);
      const response = await fetch(`${BINANCE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return json({ error: `Market data provider returned HTTP ${response.status}` }, 502);
      const rows = await response.json() as unknown[][];
      const retrievedAt = Date.now();
      const candles = rows.map(row => ({ time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closed: Number(row[6]) < retrievedAt }))
        .filter(c => Number.isFinite(c.time) && [c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite));
      return json({ symbol, interval, source: "Binance Spot REST", retrievedAt, candles }, 200, "public, max-age=10, stale-while-revalidate=15");
    }
    return json({ error: "Route not found" }, 404);
  } catch {
    return json({ error: "Market data temporarily unavailable" }, 502);
  }
}
