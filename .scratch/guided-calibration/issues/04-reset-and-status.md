# Add reset and calibration status

Status: done
Blocked by: 01

Per-scale reset and calibration status in `check_audiomuse_connection`.

## Comments

- Done: `reset_calibration { scale }` marks the scale's current calibration stale
  (`{ scale, state: 'stale', cutoff, resetAt }`, or `{ scale, state: 'missing' }`) and
  starts fresh ratings; history is kept. `check_audiomuse_connection` now returns
  `calibration: { similarity, description }`, each `{ state: 'missing' }`,
  `{ state: 'calibrated', cutoff }`, or `{ state: 'stale', cutoff, changes }`, replacing
  `calibrated`. Status lives in `Discovery.status()`.
