# APEX Crypto AI Council — multi-user release candidate

This branch implements an independent Cloudflare Workers + D1 application, rather than exposing the existing single-user paper engine through a public API.

## Included
- Google "Continue with Google" sign-in using each user’s own Gmail identity (OAuth 2.0/OIDC code + PKCE, nonce, one-time state, verified Google signature)
- Public email/password registration and private login (PBKDF2-SHA256 with per-user random salts; 310,000 iterations)
- Expiring HTTP-only, Secure, SameSite=Strict login sessions; only session-token hashes persisted
- Per-user D1 accounts, paper wallets, paper trades and positions, with user-scoped SQL
- Binance **Spot Testnet only** key verification via signed GET /api/v3/account, with AES-256-GCM encrypted key storage
- Account-specific Testnet balance refresh, credential disconnect/delete
- Public Binance Spot quotes and isolated paper BUY/CLOSE requests (not sent to Binance)
- Mobile responsive dashboard

## Safe launch steps
1. Review the pull request and merge only after validation; **do not overwrite the previous live site**.
2. In Cloudflare create a D1 database named `apex-crypto-council`.
3. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc` with the D1 database UUID.
4. Generate a random **32-byte** key in hexadecimal (64 hex characters) locally; set it as a Worker secret:
   `npx wrangler secret put ENCRYPTION_KEY`.
   Never put the key in a GitHub repo, Vite env variable, log, or browser.
5. Set up a Google Cloud OAuth 2.0 Web Application credential (ONE-TIME app-owner setup, not something each user does). Allow external Google accounts through the consent screen and publish/verify as required. Register exact redirect URI `https://YOUR_SITE/api/auth/google/callback`. Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` using `npx wrangler secret put`. Each site hostname needs an allowed redirect URI; never expose the secret to users.
6. Run `npx wrangler d1 migrations apply apex-crypto-council --remote`.
7. Install root and web packages (`npm install && npm install --prefix web`), then `npm run build:web`.
8. Deploy a **new preview Worker**, separate from the existing production Worker, with `npx wrangler deploy` only after reviewing name and bindings. Test there before mapping your existing domain.
9. Confirm that registration, login/logout, cross-account isolation, paper trade/reload, Testnet connect/read/disconnect work. Use TWO user accounts in separate browser profiles.
10. Configure DNS/custom domain only after verification. Keep real-money trading disabled.

## Important constraints
- The app is not deployed or independently test-verified by the changes in this branch.
- No real exchange orders (even Testnet) are submitted; the Binance Testnet integration is account verification and read-only balances.
- The simulator is a basic Spot long-only paper ledger using a reference price and 0.1% fees, not a production-grade matching engine or validated trading strategy.
- Account email verification, recovery/forgot-password, MFA, CAPTCHA/Turnstile, email delivery, full audit logging and automated integration tests are not implemented. Add before opening registration to untrusted public traffic.
- The previous repo's six-agent algorithms are not yet wired into user-specific persistent strategies; they remain separate from this new authenticated API.
- Use a separate Worker/D1 database per staging and production to avoid sharing data.
- Deleting/recreating the encryption key makes stored Testnet keys unreadable; plan key rotation before production.

## Google accounts and Cloudflare
Every visitor may choose their own Google/Gmail identity to create an APEX account. They never sign into the site with the owner's Cloudflare account and cannot administer Worker or D1. Google sign-in creates a separate user account and initial simulated USDT wallet. If an email already exists with password login, Google login will not silently link it; use password login until a verified account-linking flow is implemented. Only Google identity/email are requested, not access to Gmail messages.
