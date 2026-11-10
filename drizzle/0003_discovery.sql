-- Recommendation provenance and reference choices live in immutable revision JSON.
-- Existing snapshots remain readable: absent references mean distinct supplied tracks.
-- A successful expansion receipt is committed with its new revision so transport
-- retries cannot append a second batch, including after process restarts.
CREATE TABLE expansion_receipts (
  request_key TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  payload TEXT NOT NULL
);
