CREATE TABLE provider_analysis (
  run_key INTEGER PRIMARY KEY,
  observed_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT
);
