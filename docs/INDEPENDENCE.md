# Independence from APEX Signal Tank

This repository (`apex-crypto-ai-council`) is a **standalone** product.

## Not shared with neural-signal-dashboard

| Concern | Signal Tank | This project |
|---------|-------------|--------------|
| GitHub repo | Codeme256/neural-signal-dashboard | Codeme256/apex-crypto-ai-council |
| Cloudflare Worker | existing | Optional new Worker only |
| Database | Supabase + D1 | In-memory paper default; optional own DB |
| Telegram bot | Shared TradePulse bot | Optional; use a **new** bot token |
| Routes | existing site | Own HTTP API on :8787 |

No Signal Tank source files are imported at runtime. No shared secrets. No shared deploy.
