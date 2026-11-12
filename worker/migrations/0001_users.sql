-- D1 migration 0001: every mutable record belongs to one authenticated user.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT NOT NULL, bucket INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(key,bucket)
);
CREATE TABLE IF NOT EXISTS paper_wallets (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 available_usdt REAL NOT NULL DEFAULT 10000 CHECK (available_usdt >= 0),
 realized_pnl REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS paper_positions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 symbol TEXT NOT NULL, side TEXT NOT NULL CHECK(side='BUY'),
 quantity REAL NOT NULL CHECK(quantity > 0), entry_price REAL NOT NULL CHECK(entry_price > 0),
 status TEXT NOT NULL CHECK(status IN ('OPEN','CLOSED')), created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_positions_user ON paper_positions(user_id,status);
CREATE TABLE IF NOT EXISTS paper_trades (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 symbol TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
 quantity REAL NOT NULL, fill_price REAL NOT NULL, fee_usdt REAL NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_trades_user ON paper_trades(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS binance_testnet_keys (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 encrypted_credentials TEXT NOT NULL, connected_at INTEGER NOT NULL
);
