# APEX BTC Trading Desk

Initial research dashboard for Polymarket BTC Up/Down. The Worker reads venue
metadata and both outcome books, checks token identity and freshness, and
serves the dashboard. The scheduled handler records one skip per minute when
configured. Trade generation requires a verified reference feed and calibrated
model. Demo and Live order execution are pending.

## Local development

Use Node.js 24. Run `npm ci`, then `npm run check`, `npm test`, and
`npm run preview`. The preview Worker needs network access to the public
Polymarket Gamma and CLOB APIs. Venue errors appear as unavailable data.

## Scheduled journal

To enable journal writes in a Cloudflare test environment, create an isolated
D1 database, bind it as `JOURNAL` using `d1_databases` in `wrangler.jsonc`,
and apply migrations with `wrangler d1 migrations apply JOURNAL --remote`.
Configure the Worker trigger `* * * * *` and verify the first journal entry.
Test scheduled requests locally and verify the binding before adding the
remote trigger. The minute trigger records observations and skips. A separate,
latency-validated ingestion path is required for automated trading.

## Outstanding work

Exact oracle stream, market resolution and reconnect reconciliation,
calibration and evaluation, xAI rationale, Demo fills and settlement, owner
authentication, and eligible Live signing and reconciliation. Live is
disarmed and the Worker exposes only a read-only API.
