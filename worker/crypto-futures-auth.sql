-- Futures live authorization (separate from Spot)
CREATE TABLE IF NOT EXISTS crypto_futures_auth (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'FUTURES_LIVE',
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  max_notional_usdt REAL NOT NULL DEFAULT 25,
  max_leverage REAL NOT NULL DEFAULT 1,
  min_liquidation_buffer_pct REAL NOT NULL DEFAULT 5,
  reason TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crypto_futures_orders (
  id TEXT PRIMARY KEY,
  candidate_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  status TEXT NOT NULL,
  notional_usdt REAL,
  leverage REAL,
  created_at INTEGER NOT NULL,
  detail TEXT
);
