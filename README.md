# APEX AI Trade War Room — market-data deployment

This deployment target is intentionally **read-only**. It serves public Binance Spot ticker and candle data to the dashboard. It does not connect account credentials, run agents, expose portfolio balances, or submit orders.

## Run with Docker Compose

Requirements: Docker Engine and the Docker Compose plugin.

```sh
git checkout feat/apex-war-room-completion
docker compose up --build -d
```

Open `http://localhost:8080`. The Nginx web container proxies `/api/*` to the private API container. Check service status with:

```sh
docker compose ps
curl -fsS http://localhost:8080/api/health
curl -fsS 'http://localhost:8080/api/klines?symbol=BTCUSDT&interval=15m&limit=3'
```

To change the public port, set `APEX_WEB_PORT`. To change the configured watchlist, set `MARKET_SYMBOLS` (comma-separated Binance Spot symbols), then recreate services. No exchange key or LLM key is required.

## Local development

Use Node.js 20 or later:

```sh
npm install
npm test
npm run typecheck
npm run dev:api
```

In another terminal:

```sh
npm install --prefix web
npm run dev --prefix web
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8787`.

## API scope

- `GET /health`: capability status and read-only execution mode.
- `GET /ticker?symbols=BTCUSDT,ETHUSDT`: public market prices for configured symbols.
- `GET /klines?symbol=BTCUSDT&interval=15m&limit=300`: public candle history.
- Unsupported paths, including account/portfolio, scan, backtest, and order routes, are not implemented in this minimal service.

Upstream failures return an error or per-symbol unavailable status; no fallback or synthetic market values are used.

## Safety, operations, rollback

- Do not put credentials in the frontend, compose file, image, or public GitHub repository.
- No order endpoint exists in this service. Keep public internet access behind TLS and a reverse proxy if deployed remotely.
- The API binds inside the Compose network; only the web port is published by default.
- Roll back by checking out the previous known commit, then run `docker compose up --build -d`. Do not delete the paper-state data directory if your deployment later adds persistent paper state.
- Before enabling paper execution or any live trading, implement and test the missing services independently. Live trading is out of scope and disabled.

## Validation status

The files provide a Docker deployment recipe. No CI result or deployed-host health check has been observed from this chat, so deployment is not represented as verified.
