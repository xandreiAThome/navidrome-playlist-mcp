# Store calibration locally per scale

Status: done

Add the migration and storage for calibrations, ratings, and history bound as in the
[spec](../spec.md). Discovery reads cutoffs from storage and reports stale or missing
calibration per scale.

## Comments

- Done: `drizzle/0005_calibration.sql` adds calibrations (append-only, newest per scale
  is current), rating epochs, and ratings. `Storage` exposes `saveCalibration`,
  `currentCalibration`, `calibrationHistory`, `resetCalibration`,
  `recordCalibrationRatings`, and `calibrationRatings`; `calibrationChanges` in
  `src/discovery/calibration.ts` reports stale reasons. Discovery returns
  `calibration_required` with `{ scale, reason: 'missing' | 'stale', changes? }`; the
  calibration file stays a fallback for scales with nothing stored until 05.
