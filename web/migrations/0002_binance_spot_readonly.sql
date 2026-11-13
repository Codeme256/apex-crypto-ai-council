-- Separate real Binance Spot **READ-ONLY** credentials from paper and testnet.
-- A personal D1 row per authenticated APEX user. Never reuse testnet credential rows.
CREATE TABLE IF NOT EXISTS council_live_spot_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES council_users(id) ON DELETE CASCADE,
  enc_key TEXT NOT NULL,
  enc_secret TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
