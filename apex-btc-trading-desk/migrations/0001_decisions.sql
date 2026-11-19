CREATE TABLE decisions (
  run_key INTEGER PRIMARY KEY,
  observed_at INTEGER NOT NULL,
  market_slug TEXT,
  decision TEXT NOT NULL
);
CREATE INDEX decisions_observed_at ON decisions (observed_at DESC);
