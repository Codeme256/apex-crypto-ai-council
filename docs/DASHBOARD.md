# Dashboard guide

## Run (development)

Terminal 1 — API:
```bash
cd apex-crypto-ai-council
cp -n .env.example .env
npm install
npm run dev:api
# http://127.0.0.1:8787
```

Terminal 2 — Web:
```bash
cd web
npm install
npm run dev
# http://127.0.0.1:5173  (proxies /api → :8787)
```

## Primary UX

1. **AI Trading Council** (`/council`) — run scan → agent cards update → group chat streams real reports → Chief panel + chart overlays when candidate exists.
2. Skeptic objections and REJECT decisions are visually emphasized (amber/rose).
3. LIVE mode badge only when backend reports active live authorization.

## Deploy outline

- API: Node 20+ process or container on a VPS; set secrets via env.
- Web: `npm run build` in `web/` → static host (Cloudflare Pages, S3, nginx).
- Set `VITE_API_BASE` at build time to public API URL if not same-origin.
- TLS required for partner tokens in production.
