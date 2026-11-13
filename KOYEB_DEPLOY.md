# APEX Binance Public Connectivity Probe — Koyeb Free Web Service

This is a **diagnostic service only**. It makes anonymous GET requests to Binance's public `/api/v3/time` endpoints. It does not request, receive, store, or verify Binance API keys, access personal balances, or place orders.

## Deploy using Koyeb's dashboard
1. Open https://app.koyeb.com/ and sign into your own account.
2. Create **Web Service** (not Worker Service), choose **GitHub**, and authorize the repository `Codeme256/apex-crypto-ai-council`.
3. Select the branch **`koyeb/binance-network-probe`**, not `main` or your production branch.
4. Builder: **Buildpack**. **Work directory / Root directory:** repository root (`/`).
5. Build command: leave at Koyeb's Node.js buildpack default. **Run command:** `npm start`.
6. Service name: `apex-binance-probe`. **Instance type:** `Free` (only if shown in your account). **Region:** Frankfurt or Washington D.C. as available.
7. Exposed port: `3000` / HTTP. Optional environment variable `PORT=3000`. Health-check path: `/health`.
8. **No secrets are needed.** Do not supply your real Binance API key, password, or secret.
9. Deploy and use the public `*.koyeb.app` hostname given by Koyeb.
10. Open `https://YOUR-SERVICE.koyeb.app/health` and `https://YOUR-SERVICE.koyeb.app/probe`.

Successful `/health` result:
```json
{"status":"ok","service":"APEX Binance network probe","credentialAccess":false,"liveTrading":false}
```

The `/probe` response contains four tested hosts. One or more `reachable:true` results demonstrate anonymous public connectivity from the Koyeb instance. **They do not prove that authenticated Binance account endpoints work.** A `false` result means unavailable, rejected, timed out, or otherwise failed. Check `httpStatus` and `errorType` to distinguish cases.

Do not route Binance production credentials or live orders through this public testing service. Koyeb Free services can scale to zero during idle periods and are not suitable for an always-on real-money trading backend.

## Existing Cloudflare site
This branch leaves the deployed APEX Crypto AI Council website and its user accounts entirely untouched.
