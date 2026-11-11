# What you must provide to finish deployment & live trading

## Required for local paper (minimum)

| Item | Why |
|------|-----|
| Node.js 20+ | Run API + install deps |
| This project folder | Clone this repo |

**No API keys needed** for real-time prices / klines (Binance public REST), council scans in PAPER mode, or dashboard charts.

## Required for deploy

| Item | Example |
|------|---------|
| Host for API | VPS, Railway, Render, Fly.io |
| Host for static web | Cloudflare Pages, Netlify, nginx |
| Domain + HTTPS | Recommended for partner token safety |

## Optional — Phase 3 read-only balances

Binance read-only API key + secret (no withdraw).

## Optional — Phase 4/5 live trading

Trade key (no withdraw) + `APEX_ADMIN_SECRET` + explicit `ENABLE_SPOT_LIVE` / `ENABLE_FUTURES_LIVE`.

## Optional — Signal Tank display

`APEX_PARTNER_READ_TOKEN` (different from admin secret).

## Free real-time market data (already used)

`https://api.binance.com` public REST — no key required.
