CREATE TABLE update_operations (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id),
 target_id TEXT NOT NULL,
 payload TEXT NOT NULL,
 owner TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 blocked INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX update_target_block ON update_operations(target_id) WHERE blocked = 1;
