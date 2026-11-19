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

## Hosted research preview

The isolated Cloudflare Worker uses a one-minute cron trigger and the D1
journal. The journal keeps up to 30 days of sampled quotes and decisions.
The production schema was bootstrapped using migrations 0001 and 0002 through
the D1 query endpoint. Use Wrangler migrations when creating a fresh database.

For a standard deployment, run `npm run build` and `wrangler deploy` using an
authorized account. The current preview uses a module-bundled fallback because
the direct assets upload endpoint timed out. To reproduce it, run a Wrangler
deployment dry run with an output directory, upload the compiled Worker as
`desk.js`, and use `deploy/bundled-worker.js` as `index.js`. Generate
`assets.js` with `node deploy/package-assets.js dist assets.js`. Bind D1 as
`JOURNAL` and set the one-minute schedule. Roll back by restoring the previous
Worker deployment version. The migrations are additive and survive a Worker
rollback.

## APInex Grok notes

Apply migration 0003 and set the Cloudflare Worker secret `PROVIDER_API_KEY`.
The Worker requests one Grok order-book summary per hour at minute 02 UTC
when both books are usable. A unique D1 row prevents duplicate charges on
cron retries. The notes use public quotes, have no order permissions, and
are independent of trade checks. Remove the secret to stop provider calls.
