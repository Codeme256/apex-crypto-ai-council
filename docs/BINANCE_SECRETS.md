# Binance credentials — Phase 3 (read-only)

## Principle

- API keys live **only** in Cloudflare Worker secrets (or server env).
- **Never** put keys in GitHub, browser bundles, Telegram messages, or D1 rows.
- Use **read-only** keys with **no withdrawal** permission.
- Prefer IP allowlisting when Binance supports it for your account type.
- Spot and Futures use **separate** key pairs.

## Required secrets (Telegram / council Worker)

| Secret | Purpose |
|--------|---------|
| `BINANCE_SPOT_API_KEY` | Spot signed reads |
| `BINANCE_SPOT_API_SECRET` | Spot HMAC |
| `BINANCE_FUTURES_API_KEY` | USDⓈ-M Futures signed reads |
| `BINANCE_FUTURES_API_SECRET` | Futures HMAC |
| `BINANCE_TESTNET` | Optional `true` for testnet hosts |

Set with Wrangler (values never echoed to chat):

```bash
npx wrangler secret put BINANCE_SPOT_API_KEY
npx wrangler secret put BINANCE_SPOT_API_SECRET
npx wrangler secret put BINANCE_FUTURES_API_KEY
npx wrangler secret put BINANCE_FUTURES_API_SECRET
```

## Binance key permissions checklist

Enable only:

- Enable Reading

Disable / do not enable:

- Enable Spot & Margin Trading (until a later gated phase)
- Enable Futures (trading) until separately authorized
- Enable Withdrawals — **never**

## What Phase 3 can call

- Spot: `GET /api/v3/account`, `GET /api/v3/openOrders`
- Futures: `GET /fapi/v2/account`, `GET /fapi/v2/balance`, `GET /fapi/v2/positionRisk`, `GET /fapi/v1/openOrders`

## What is still blocked

- Any `POST/DELETE` order placement or cancel
- Withdraw / transfer endpoints
- Automatic promotion from paper → live

## Regional eligibility

Confirm your region supports Binance Spot / USDⓈ-M products before enabling live trading in a future phase. Phase 3 only reads account state when keys are present.
