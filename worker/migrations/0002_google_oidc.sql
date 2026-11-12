-- Google OIDC accounts, one identity per APEX user and globally unique Google subject.
CREATE TABLE IF NOT EXISTS google_identities (
 google_sub TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_flows (
 state_hash TEXT PRIMARY KEY NOT NULL,
 verifier TEXT NOT NULL,
 nonce TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_flows_expires ON oauth_flows(expires_at);
