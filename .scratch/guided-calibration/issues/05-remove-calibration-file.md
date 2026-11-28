# Remove the calibration file and rewrite calibration docs

Status: done
Blocked by: 03, 04

Remove `AUDIOMUSE_CALIBRATION_PATH` and file loading, document the one-time move of
existing cutoffs, rewrite `docs/calibration.md` as concepts, and trim
`docs/discovery.md`.

## Comments

- Done: removed `AUDIOMUSE_CALIBRATION_PATH`, file loading, and the discovery file
  fallback; a still-set variable is ignored (no load, no startup failure) and scales
  report `missing` until saved. Tests seed calibration via `save_calibration` with
  a note; a migration test moves old file cutoffs once. `docs/calibration.md`
  rewritten as concepts; discovery, README, and `.env.example` updated.
