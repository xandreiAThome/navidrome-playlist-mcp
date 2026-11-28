-- Calibration per recommendation scale (ADR 0006). Each save appends a row; the
-- newest row for a scale is its current calibration and older rows are history.
-- A calibration is bound to the AudioMuse URL, selected server, Navidrome URL, and
-- minor release it was measured on; a reset marks it stale explicitly.
CREATE TABLE calibrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scale TEXT NOT NULL CHECK (scale IN ('similarity', 'description')),
  cutoff REAL NOT NULL,
  audiomuse_url TEXT NOT NULL,
  server TEXT NOT NULL,
  navidrome_url TEXT NOT NULL,
  release TEXT NOT NULL,
  release_minor TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  note TEXT,
  saved_at TEXT NOT NULL,
  reset_at TEXT
);
CREATE INDEX calibration_scale ON calibrations(scale, id);
-- The rating epoch new ratings join. Saving or resetting a scale starts a new epoch,
-- so recalibration collects fresh ratings and earlier epochs remain as history.
CREATE TABLE calibration_scales (
  scale TEXT PRIMARY KEY NOT NULL CHECK (scale IN ('similarity', 'description')),
  epoch INTEGER NOT NULL
);
-- Re-rating a candidate for the same probe within an epoch replaces the rating.
CREATE TABLE calibration_ratings (
  scale TEXT NOT NULL CHECK (scale IN ('similarity', 'description')),
  epoch INTEGER NOT NULL,
  probe TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  score REAL NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good', 'poor')),
  rated_at TEXT NOT NULL,
  PRIMARY KEY (scale, epoch, probe, item_id)
);
