ALTER TABLE operations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE operations ADD COLUMN status TEXT NOT NULL DEFAULT 'creating';
ALTER TABLE operations ADD COLUMN phase TEXT NOT NULL DEFAULT 'create';
ALTER TABLE operations ADD COLUMN playlist_id TEXT;
ALTER TABLE operations ADD COLUMN recovery_version INTEGER NOT NULL DEFAULT 0;
UPDATE operations SET revision=json_extract(payload, '$.revision'),
  status=json_extract(payload, '$.status'), phase=json_extract(payload, '$.phase'),
  playlist_id=json_extract(payload, '$.playlistId'),
  recovery_version=json_extract(payload, '$.recoveryVersion');
