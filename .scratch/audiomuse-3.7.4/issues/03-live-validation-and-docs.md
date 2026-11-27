# Validate against the live v3.7.4 deployment and update docs

Status: resolved
Blocked by: 02

Run `check_audiomuse_connection`, `find_similar_tracks`, and `discover_tracks`
against the user's deployment with the existing calibration file. Update README,
`docs/discovery.md`, and `docs/calibration.md` to say 3.7.x (validated on v3.7.4),
preserving the user's uncommitted doc edits.

## Comments

### 2026-11-27: live validation (read-only, via stdio MCP client on `feat/audiomuse-3.7.x`)

Deployment reports `v3.7.4`; existing calibration file is `v3.7.1`
(maxDistance 0.0968, minDescriptionSimilarity 0.5412).

- `check_audiomuse_connection`: `ok`, connected, version `v3.7.4`, calibrated.
- `find_similar_tracks` (reference "Without Love" / LMYK, count 5): 5 results,
  scores 0.033–0.048 (all ≤ maxDistance), shortfall 0.
- `discover_tracks` ("calm instrumental jazz", count 5): 2 results, scores
  0.559 and 0.556 (≥ minDescriptionSimilarity), shortfall 3 reported rather than
  padded.

Live validation passes. Remaining: docs update (README, `docs/discovery.md`,
`docs/calibration.md`), pending the user's uncommitted doc edits. Listening
quality not judged here.

### 2026-11-27: docs updated

README, `docs/discovery.md`, and `docs/calibration.md` now say 3.7.x (validated on
v3.7.4). The calibration guide's version check accepts any canonical 3.7.x
(verified `true` against the live deployment), records the deployment's actual
`app_version` in the calibration file, and explains that only a minor-release
change requires recalibration. The user's earlier doc edits were committed first
(`be0ceb6`).
