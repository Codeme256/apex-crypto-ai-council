# Unified APEX login, agent evidence and news

This change preserves all existing D1 account, session, wallet, and per-user Testnet tables.

## User-visible fixes

- **My Account** includes real email/password registration, login and logout using the existing `/api/auth/*` endpoints. Users may use their own Gmail addresses; no Cloudflare account or Google OAuth is required. Passwords are not stored by the browser.
- The old `/api/private/welcome` URL now redirects browser navigation to `/#account`; it no longer displays unauthenticated JSON as a login page.
- Technical agents and the price chart use the same exchange candle series. The Council API returns the exact market snapshot it evaluated. The header separately shows the current source-labelled exchange quote.
- **News Intelligence** uses verified publisher RSS headlines from CoinDesk, Cointelegraph, Decrypt, and The Block with original links, publication timestamps and source health. Relevance labels are keyword-based, not sentiment or trading predictions.
- The News agent reports fetched headlines and has a failure state. Technical agents still use deterministic candle evidence; News does not authorize orders.

## Validation

- `npm run build` must pass in Cloudflare Pages.
- Public `/api/health`, `/api/klines`, `/api/council`, `/api/news` must return suitable JSON.
- UI login must be a form, not a raw private endpoint. GET `/api/private/welcome` with Accept: text/html should redirect to `/#account`.
- Guest sees a sign-in form, not a fabricated paper balance.
- News failures must appear as explicit unavailable states without synthetic stories.
- Exchange source is consistently identified; Coinbase fallback cannot be mislabelled as Binance.
- Cloudflare D1 user/wallet records and existing credential encryption settings are unchanged.
- No real-money exchange orders added.

## Rollback

Revert this PR; no migrations or data mutations are needed.
