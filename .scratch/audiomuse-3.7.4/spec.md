# Support AudioMuse 3.7.x, validated against v3.7.4

Status: ready-for-agent

Prerequisite for [npm-distribution](../npm-distribution/spec.md). The user's
AudioMuse deployment was upgraded from v3.7.1 to v3.7.4; the adapter hard-codes
v3.7.1 (`src/config.ts`, `src/discovery/service.ts`), so discovery now fails.

## Problem Statement

AudioMuse ships patch releases frequently (v3.7.2–v3.7.4 within 19 days, two adding
features). Exact-version pinning breaks discovery and invalidates calibration on
every upstream patch.

## Solution

- Accept any AudioMuse 3.7.x release once v3.7.4 is validated as the baseline;
  reject other minor releases until validated.
- Calibration becomes stale on a minor-release change, not a patch change. Apply
  this now to the existing file-based calibration (its `version` field records the
  calibrated release); [guided-calibration](../guided-calibration/spec.md) carries
  the same rule into local storage.
- Upstream response validation stays strict, so an unlisted breaking change surfaces
  as an error rather than wrong results.

## Implementation Decisions

- Release notes for v3.7.2–v3.7.4 mention no change to `/api/version`,
  `/api/servers`, `/api/similar_tracks`, `/api/max_distance`, `/api/clap/search`,
  bearer auth, the `server` parameter, models, or distance metric. Notes are
  summaries: confirm with the source diff (`v3.7.1...v3.7.4`) before claiming
  compatibility. Note security fixes GHSA-8ph4-3rgv-8hvr and GHSA-vww2-v52c-r98r and
  check whether either changes authentication or request handling we rely on.
- Represent supported releases as one constant (supported minor `3.7`, validated
  baseline `v3.7.4`), used by config validation, runtime checks,
  `check_audiomuse_connection`, and later by `setup`.
- Live calibration recorded in `.scratch/audiomuse-integration/` stays historical.

## Testing Decisions

- Fixtures report v3.7.4; add cases for an accepted patch (v3.7.1 calibration on a
  v3.7.4 deployment), a rejected minor (v3.8.0), and malformed versions.

## Out of Scope

- Calibration storage changes, setup tooling, and new AudioMuse endpoints.
