-- Add email/password auth to existing War Room users without deleting their wallets.
CREATE TABLE IF NOT EXISTS council_auth_passwords (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES council_users(id) ON DELETE CASCADE,
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS council_auth_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES council_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_council_auth_sessions_user ON council_auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_council_auth_sessions_expiry ON council_auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS council_auth_rate (
 key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (key,bucket)
);
