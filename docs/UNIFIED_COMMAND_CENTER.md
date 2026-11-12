# Single-site APEX Crypto AI Council

The only user-facing site is **https://apex-crypto-ai-council.pages.dev/**.

## Unified frontend
- Public market overview: live source-labelled candlestick charts, council evidence, market status.
- My APEX Account: existing Cloudflare Access email identity and D1 user account, no second dashboard.
- Paper Trading: existing authenticated cloud-wallet endpoints, paper BUY/SELL, kill switch, equity/holdings, trade history and risk limitations.
- Binance Spot Testnet: existing per-user encrypted credential endpoints, account verification, virtual balances and disconnect control.
- The older App.tsx remains as source history, but is never rendered. There is no `?view=console` switch in the application entry point; visiting that legacy URL renders the same Command Center.
- All functionality uses same-origin existing `/api/*` endpoints and retains existing data storage, encryption and account isolation.
- Live-money exchange trading remains disabled.

## Validation checklist
1. Root homepage displays one Command Center with account and trading panels.
2. `/?view=console` shows the same Command Center — not the legacy dashboard.
3. /api/health, /api/klines and /api/council remain available with real provider evidence.
4. Guest sees Sign In Required and **no fabricated virtual account**.
5. Authenticated user sees their own saved D1 paper wallet and can access their existing Testnet credential settings. Do not submit credentials during automated smoke tests.
6. Paper buy/sell and kill switch buttons call original private endpoints; no direct Binance order routes are introduced.
7. Mobile widths remain usable and account panels are reachable in one sidebar.

## Rollback
Revert the merge into the Cloudflare production branch. The underlying D1 tables and Cloudflare Access policies are not changed.
