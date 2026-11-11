# Phases status (standalone council)

All original capability phases are implemented inside this independent project.

| Phase | Status | Location |
|-------|--------|----------|
| 1 Market · agents · risk · paper | Done | `src/market`, `agents`, `risk`, `paper`, `orchestration` |
| 2 Audit · notify-oriented design | Done | `src/persistence`, `worker/crypto-notify.mjs` |
| 3 Read-only Binance account | Done | `src/market/binance-signed.ts` |
| 4 Gated Spot live | Done | `src/live/authorization.ts`, `spot-orders.ts`, `execute-spot.ts` |
| 5 Gated Futures live | Done | `src/live/futures-*.ts`, `execute-futures.ts` |
| 6 Ops · health · kill switch · incidents | Done | `src/ops/*`, `docs/DEPLOYMENT_RUNBOOK.md` |
| 7 HTTP API · CLI · LLM adapter | Done | `src/http/server.ts`, `scripts/*`, `agents/llm-adapter.ts` |

There is no Phase 8 required for the original brief.

**Optional later product work** (not blocking):

- SQLite/Postgres persistence instead of in-memory paper
- Dedicated Telegram bot (new token) using `worker/` modules
- Web UI (this project ships API + CLI first)
- Bundle council tick inside a CF Worker without external URL
