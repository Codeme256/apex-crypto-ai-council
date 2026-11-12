# Verified live news and matching chart/agent evidence

This is a change **within the existing single-site APEX Crypto AI Council**.

- Existing register/login/logout form, email sessions and personal paper-wallet dashboard are preserved.
- Legacy private welcome navigation redirects to `/#account`, not a raw JSON response or deleted old dashboard route.
- The Council returns the same candles as used for analysis (`market` on `GET /api/council`).
- The chart displays that same verified source, with a timestamped latest quote. Stale quotes are explicitly labelled.
- `GET /api/news?symbol=BTCUSDT` aggregates official RSS from CoinDesk, Cointelegraph, Decrypt and The Block. It returns publisher links, dates, source availability and keyword-only relevance. When no feed works, HTTP 503 replaces fabricated data.
- The News agent reflects verified headlines, while quantitative Council agents still follow the independent risk veto. No trading authorization has been enabled.

Smoke-test production: `/`, `/#account`, `/api/news?symbol=BTCUSDT`, `/api/council?symbol=BTCUSDT&timeframe=15m`, and browser-navigation `/api/private/welcome`.
Do not create live accounts during automated tests and do not modify D1 or Binance API secrets.
