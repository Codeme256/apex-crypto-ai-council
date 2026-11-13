# One-site Binance and Bybit integration — November 2026

The user-facing application remains https://apex-crypto-ai-council.pages.dev/ .

## Verified account connectivity, no live orders
- Existing Binance production Spot connection is read-only; signed API key permission flags are rechecked on account access.
- Fixed an AES-GCM decryption bug: production keys now use their original encryption scope, separate from Testnet.
- New Bybit production connector verifies a system-generated HMAC API key using GET /v5/user/query-api (readOnly=1), rejects withdrawal-enabled keys, and queries GET /v5/account/wallet-balance?accountType=UNIFIED .
- User-specific credentials are encrypted in separate D1 tables using provider-specific authenticated data. Never put secrets into client logs, source code, chat or documentation.
- Apply web/migrations/0003_bybit_live_readonly.sql to the existing production D1 database before production promotion. It adds a table and leaves balances, logins and existing keys intact.

## Conservative 2% guard
Because the user answered 2% without distinguishing risk from purchase size, both planned stop-loss and total order value are capped at 2% of verified equity until separately authorized otherwise. Policy also requires verified exchange account and trading permissions, real protective stop, owner authorization, no emergency stop, max 2% daily loss, 5% weekly loss, 6 entries/day, pause after 2 consecutive losses and 1x max leverage until tested. Implementation: web/src/lib/execution-risk-2pct.ts; tests: web/src/lib/execution-risk-2pct.test.ts.

## Execution stays OFF
The current dashboard lacks a fully tested server-side 24/7 order worker, reconciliation, idempotency, Futures reduce-only handling and failure recovery. The authentication-protected readiness API deliberately reports ordersEnabled=false. Read-only keys cannot trade. Do not claim automatic trading works until those separate pieces are implemented and tested.

## Official API references
https://bybit-exchange.github.io/docs/v5/guide
https://bybit-exchange.github.io/docs/v5/user/apikey-info
https://bybit-exchange.github.io/docs/v5/account/wallet-balance
https://developers.binance.com/en/docs/products/spot/rest-api
https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account

## Verification
1. Run npm run build inside web.
2. Run npx vitest run src/lib/execution-risk-2pct.test.ts inside web.
3. An anonymous GET /api/private/bybit/status must return 401.
4. The guest site must hide real balances and secrets.
5. With a signed-in account, status and balance queries must use real exchange APIs.
6. Bybit key with readOnly=0 or withdraw permission must be rejected and never stored.
7. Market API failures must not be replaced with invented balances or prices.
8. Existing Council, paper trading, login and Binance Testnet must remain intact.
