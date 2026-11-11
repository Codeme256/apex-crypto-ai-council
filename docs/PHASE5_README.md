# APEX Crypto AI — Phase 5 Deliverable

**Gated USDⓈ-M Futures live** with isolated margin, leverage cap, and liquidation buffer checks.
Independent of Spot live authorization.

## Constraints (hard-coded)

| Control | Value |
|---------|--------|
| Margin | Isolated only |
| Default leverage | 1× (auth max ≤ 3) |
| Concurrent positions | 1 |
| Default max notional | 25 USDT (cap 2000) |
| Min liquidation buffer | 5% (floor 3%) |
| Auth TTL | 15m–12h (default 2h) |
| Confirm string | `ENABLE_FUTURES_LIVE` |

## Safety

- Separate FUTURES_LIVE authorization from Spot
- No withdraw permissions on trade keys
- Paper remains default when auth absent or expired
