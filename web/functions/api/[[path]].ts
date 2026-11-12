const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const INTERVALS = new Map([["1m", 60], ["5m", 300], ["15m", 900], ["30m", 1800], ["1h", 3600], ["4h", 21600], ["1d", 86400]]);
const BINANCE = "https://data-api.binance.vision";
const COINBASE = "https://api.exchange.coinbase.com";

type Env = { MARKET_SYMBOLS?: string };
type PagesContext = { request: Request; env: Env };
type Ticker = { symbol: string; price: number | null; ok: boolean; source: string; timestamp: number };
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean };
const json = (value: unknown, status = 200, cache = "no-store") => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff" },
});

async function providerJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "APEX-War-Room/1.0" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
async function ticker(symbol: string): Promise<Ticker> {
  // Coinbase Exchange has public USDT products for BTC/ETH/SOL; BNB may fall back to Binance.
  const coinbaseProduct = symbol.replace(/(USDT|USDC|USD)$/, "-$1");
  try {
    const data = await providerJson(`${COINBASE}/products/${encodeURIComponent(coinbaseProduct)}/ticker`) as { price?: string; time?: string };
    const price = Number(data.price);
    if (Number.isFinite(price)) return { symbol, price, ok: true, source: `Coinbase Exchange (${coinbaseProduct})`, timestamp: data.time ? Date.parse(data.time) || Date.now() : Date.now() };
  } catch { /* Try the documented public-only Binance endpoint. */ }
  try {
    const data = await providerJson(`${BINANCE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`) as { price?: string };
    const price = Number(data.price);
    if (Number.isFinite(price)) return { symbol, price, ok: true, source: "Binance Spot REST", timestamp: Date.now() };
  } catch { /* Return explicitly unavailable; never synthesize a quote. */ }
  return { symbol, price: null, ok: false, source: "Public feeds unavailable", timestamp: Date.now() };
}
async function candlesFor(symbol: string, interval: string, limit: number, now: number): Promise<{ candles: Candle[]; source: string }> {
  const granularity = INTERVALS.get(interval)!;
  const coinbaseProduct = symbol.replace(/(USDT|USDC|USD)$/, "-$1");
  try {
    const rows = await providerJson(`${COINBASE}/products/${encodeURIComponent(coinbaseProduct)}/candles?granularity=${granularity}`) as unknown[][];
    const candles = rows.map(row => ({ time: Number(row[0]), low: Number(row[1]), high: Number(row[2]), open: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closed: (Number(row[0]) + granularity) * 1000 <= now }))
      .filter(c => Number.isFinite(c.time) && [c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite))
      .sort((a, b) => a.time - b.time)
      .slice(-limit);
    if (candles.length) return { candles, source: `Coinbase Exchange (${coinbaseProduct})` };
  } catch { /* Try Binance below; Coinbase only publishes listed products. */ }

  const rows = await providerJson(`${BINANCE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`) as unknown[][];
  const candles = rows.map(row => ({ time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closed: Number(row[6]) < now }))
    .filter(c => Number.isFinite(c.time) && [c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite));
  return { candles, source: "Binance Spot REST" };
}

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const allowed = new Set((env.MARKET_SYMBOLS || DEFAULT_SYMBOLS.join(",")).split(",").map(s => s.trim().toUpperCase()).filter(Boolean));
  if (route === "health") {
    return json({ service: "apex-market-api", version: "1.1.0", overall: "healthy", modeDefault: "READ_ONLY", timestamp: Date.now(), live: { spotAuthActive: false, futuresAuthActive: false, killSwitch: true, circuitBreaker: false }, capabilities: { publicMarketData: true, portfolio: false, agents: false, paperExecution: false, liveExecution: false } });
  }
  if (route === "ticker") {
    const requested = url.searchParams.get("symbols")?.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) ?? [...allowed];
    if (!requested.length || requested.length > 20 || requested.some(s => !allowed.has(s))) return json({ error: "Use up to 20 configured market symbols" }, 400);
    const tickers = await Promise.all(requested.map(ticker));
    return json({ tickers }, 200, "public, max-age=3, stale-while-revalidate=5");
  }
  if (route === "klines") {
    const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
    const interval = url.searchParams.get("interval") || "15m";
    const limit = Number(url.searchParams.get("limit") || 200);
    if (!allowed.has(symbol)) return json({ error: "Symbol is not configured" }, 400);
    if (!INTERVALS.has(interval)) return json({ error: "Unsupported candle interval" }, 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return json({ error: "limit must be an integer from 1 to 1000" }, 400);
    try {
      const result = await candlesFor(symbol, interval, limit, Date.now());
      return json({ symbol, interval, source: result.source, retrievedAt: Date.now(), candles: result.candles }, 200, "public, max-age=10, stale-while-revalidate=15");
    } catch {
      return json({ error: "Market data is unavailable from configured public providers" }, 502);
    }
  }
  return json({ error: "Route not found" }, 404);
}
