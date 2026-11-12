import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173";
const SYMBOLS = new Set((process.env.MARKET_SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT").split(",").map(s => s.trim().toUpperCase()).filter(Boolean));
const INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
const BINANCE = "https://api.binance.com";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean };

function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && origin === ALLOWED_ORIGIN) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
}
async function binance(path: string) {
  const response = await fetch(`${BINANCE}${path}`, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Market data provider returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}
function checkSymbol(raw: string | null): string | null {
  const symbol = (raw ?? "").toUpperCase();
  return SYMBOLS.has(symbol) ? symbol : null;
}

const server = createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "GET") { send(res, 405, { error: "Method not allowed" }); return; }
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname === "/health") {
      send(res, 200, { service: "apex-market-api", version: "1.0.0", overall: "healthy", modeDefault: "READ_ONLY", timestamp: Date.now(), live: { spotAuthActive: false, futuresAuthActive: false, killSwitch: true, circuitBreaker: false }, capabilities: { publicMarketData: true, portfolio: false, agents: false, paperExecution: false, liveExecution: false } });
      return;
    }
    if (url.pathname === "/ticker") {
      const requested = url.searchParams.get("symbols")?.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) ?? [...SYMBOLS];
      if (!requested.length || requested.length > 20 || requested.some(x => !SYMBOLS.has(x))) { send(res, 400, { error: "Use up to 20 configured market symbols" }); return; }
      const tickers = await Promise.all(requested.map(async symbol => {
        try {
          const result = await binance(`/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`) as { price?: string };
          const price = Number(result.price);
          return { symbol, price: Number.isFinite(price) ? price : null, ok: Number.isFinite(price), source: "Binance Spot REST", timestamp: Date.now() };
        } catch { return { symbol, price: null, ok: false, source: "Binance Spot REST", timestamp: Date.now() }; }
      }));
      send(res, 200, { tickers }); return;
    }
    if (url.pathname === "/klines") {
      const symbol = checkSymbol(url.searchParams.get("symbol"));
      const interval = url.searchParams.get("interval") ?? "15m";
      const limit = Number(url.searchParams.get("limit") ?? 200);
      if (!symbol) { send(res, 400, { error: "Symbol is not configured" }); return; }
      if (!INTERVALS.has(interval)) { send(res, 400, { error: "Unsupported candle interval" }); return; }
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) { send(res, 400, { error: "limit must be an integer from 1 to 1000" }); return; }
      const raw = await binance(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`) as unknown[][];
      const now = Date.now();
      const candles: Candle[] = raw.map(row => ({ time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closed: Number(row[6]) < now })).filter(c => Number.isFinite(c.time) && [c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite));
      send(res, 200, { symbol, interval, source: "Binance Spot REST", retrievedAt: now, candles }); return;
    }
    send(res, 404, { error: "Route not found" });
  } catch (error) {
    send(res, 502, { error: "Market data temporarily unavailable", detail: error instanceof Error ? error.message : "Unknown upstream failure" });
  }
});

server.listen(PORT, HOST, () => console.log(`APEX read-only market API listening at http://${HOST}:${PORT}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
