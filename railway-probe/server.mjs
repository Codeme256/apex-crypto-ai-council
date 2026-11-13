import http from "node:http";

const targets = [
  ["Binance production", "https://api.binance.com/api/v3/time"],
  ["Binance production backup", "https://api-gcp.binance.com/api/v3/time"],
  ["Binance public market data", "https://data-api.binance.vision/api/v3/time"],
  ["Binance Spot Testnet", "https://testnet.binance.vision/api/v3/time"],
];
const send = (res, status, data) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
const probe = async ([name, url]) => {
  const start = Date.now();
  try {
    const result = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    let verified = false;
    if (result.ok && result.headers.get("content-type")?.includes("application/json")) {
      const data = await result.json();
      verified = Number.isSafeInteger(data?.serverTime) && Math.abs(data.serverTime - Date.now()) < 300000;
    }
    return { name, host: new URL(url).host, reachable: verified, httpStatus: result.status, elapsedMs: Date.now() - start };
  } catch (error) {
    return { name, host: new URL(url).host, reachable: false, errorType: error?.name || "NetworkError", elapsedMs: Date.now() - start };
  }
};
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  if (pathname === "/health") return send(res, 200, { status: "ok", service: "APEX Binance network probe", credentialAccess: false, liveTrading: false });
  if (pathname === "/probe") {
    const hosts = await Promise.all(targets.map(probe));
    return send(res, 200, {
      checkedAt: new Date().toISOString(),
      purpose: "Public Binance network reachability only; no API credentials or signed account calls",
      hosts,
    });
  }
  return send(res, 404, { error: "Not found", paths: ["/health", "/probe"] });
}).listen(port, "0.0.0.0", () => console.log("APEX public Binance network probe listening on port", port));
