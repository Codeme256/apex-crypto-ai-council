-- Bybit API credentials are isolated from Binance, per authenticated user.
-- Only read-only production Bybit HMAC keys are accepted by the API.
CREATE TABLE IF NOT EXISTS council_bybit_live_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES council_users(id) ON DELETE CASCADE,
  enc_key TEXT NOT NULL,
  enc_secret TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
