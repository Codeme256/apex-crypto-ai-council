# APEX Crypto AI Council

**Completely independent** multi-agent crypto trading system.

| | |
|--|--|
| **This repo** | `Codeme256/apex-crypto-ai-council` |
| **Not this** | `Codeme256/neural-signal-dashboard` (Signal Tank) |

Signal Tank must **not** host the trading engine, Binance trade secrets, or order placement.
The two systems talk only through a **partner read API** (signals + status).

## Architecture principle

```
APEX Crypto AI Council  <-- GET /partner/status  --  APEX Signal Tank
(Binance keys stay here) <-- GET /partner/signals --  (display only)
Paper / gated live                                 optional Telegram
```

## Five development phases

| Phase | Scope | Live money |
|-------|--------|------------|
| **1** | Independent setup, Binance market data, six AI agents | No |
| **2** | Spot/Futures paper trading, backtest, deterministic risk | No |
| **3** | Secure Binance account read, balances, reconciliation | No |
| **4** | Limited live Spot after tests + explicit admin authorization | Opt-in |
| **5** | Futures validation, liquidation buffers, live Futures (separate auth) | Opt-in |

Default mode is always **PAPER**. Live is never auto-enabled.

## Quick start

```bash
cd apex-crypto-ai-council
cp .env.example .env
# Set APEX_ADMIN_SECRET and APEX_PARTNER_READ_TOKEN

npm install
npm test
npm run scan -- BTCUSDT
npm run dev
```

```bash
curl -s localhost:8787/health | jq
curl -s -X POST localhost:8787/scan -H 'content-type: application/json' -d '{"symbol":"BTCUSDT"}' | jq
curl -s -X POST localhost:8787/backtest -H 'content-type: application/json' -d '{"symbol":"BTCUSDT","candleLimit":300}' | jq

# Partner API for Signal Tank
curl -s localhost:8787/partner/status -H "Authorization: Bearer $APEX_PARTNER_READ_TOKEN" | jq
```

## Dashboard

```bash
npm run dev:api   # :8787
cd web && npm install && npm run dev  # :5173
```

## Safety

- Binance keys only in this project secrets
- Withdraw disabled on exchange keys
- Partner token ≠ admin token
- Kill switch: POST /admin/kill-switch

See `docs/SIGNAL_TANK_INTEGRATION.md` and `docs/INDEPENDENCE.md`.
