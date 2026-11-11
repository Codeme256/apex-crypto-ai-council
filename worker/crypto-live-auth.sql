-- Spot live authorization rows
CREATE TABLE IF NOT EXISTS crypto_live_auth (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'SPOT_LIVE',
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  max_notional_usdt REAL NOT NULL DEFAULT 50,
  reason TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crypto_live_orders (
  id TEXT PRIMARY KEY,
  candidate_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  status TEXT NOT NULL,
  notional_usdt REAL,
  created_at INTEGER NOT NULL,
  detail TEXT
);
