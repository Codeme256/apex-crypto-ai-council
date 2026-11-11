# APEX Crypto AI — Phase 6 Deliverable

**Production hardening:** health probes, kill switch ops, incident playbooks, deployment/rollback runbook, expanded tests.

## Ops routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/crypto/ops/health` | Public (no secrets) |
| GET | `/crypto/ops/status` | Bearer |
| POST | `/crypto/ops/kill-switch` | Bearer |
| POST | `/crypto/ops/circuit-breaker` | Bearer |

## Emergency stop

```bash
curl -X POST -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"active":true,"reason":"incident"}' \
  "$BASE/crypto/ops/kill-switch"
```

Live trading remains **opt-in** and is not required for paper production use.
