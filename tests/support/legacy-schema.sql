PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), fingerprint TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, current_revision INTEGER NOT NULL, locked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS revisions (
        draft_id TEXT NOT NULL REFERENCES drafts(id), revision INTEGER NOT NULL, payload TEXT NOT NULL,
        previewed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(draft_id, revision));
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id),
        request_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
        owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS operation_keys (
        request_key TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES drafts(id), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO operation_keys SELECT request_key, draft_id, json_extract(payload, '$.revision') FROM operations;
