# Architecture — Independent APEX Crypto AI Council

## Isolation

- Separate GitHub repository
- Separate process (Node HTTP API)
- Separate secrets
- Separate optional Worker/D1 if used later
- No imports from neural-signal-dashboard at runtime

## Internal packages

1. **Agents** — Scout, Chart, News, Sentiment, Skeptic, Chief (deterministic; optional LLM)
2. **Risk** — Hard gates (RR, loss limits, concurrency, stale data, kill switch)
3. **Paper** — Simulated fills with fees/slippage
4. **Backtest** — Historical walk-forward on public klines
5. **Market** — Public REST + signed read-only account
6. **Live** — Spot and Futures executors behind expiring authorization
7. **Ops** — Health, kill switch, incident playbooks
8. **Integration** — Partner read API for Signal Tank

## Data flow (paper)

Market data → Scout → analysis agents → Skeptic → Chief → Risk → Paper engine → Partner signal buffer

## Data flow (live Spot/Futures)

Same until Risk, then requires active non-expired admin authorization → exchange order + protective stops → reconcile

## Signal Tank boundary

Only `/partner/status` and `/partner/signals` with `APEX_PARTNER_READ_TOKEN`.
