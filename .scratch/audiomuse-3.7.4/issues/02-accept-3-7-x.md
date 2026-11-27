# Accept AudioMuse 3.7.x with minor-release calibration staleness

Status: resolved
Blocked by: 01

Replace the `v3.7.1` literals in config validation and the discovery service with a
single supported-release constant. Accept 3.7.x deployments; treat a calibration as
stale only when its minor release differs from the deployment's. Update fixtures and
tests per the spec's testing decisions.

## Comments

- `src/discovery/release.ts` holds the single supported-release constant (minor `3.7`,
  validated baseline `v3.7.4`) and `vMAJOR.MINOR.PATCH` parsing.
- Config accepts a calibration `version` of any 3.7.x release; another minor is a
  `configuration_error` saying 3.7.x is supported and the calibration is stale and must
  be redone, and a malformed or non-canonical version (for example `3.7.4`, `v3.7`,
  `v03.7.1`) is a `configuration_error` naming the invalid version and expected
  `vMAJOR.MINOR.PATCH` format.
- Discovery and `check_audiomuse_connection` share `AudioMuse.supportedVersion`: a
  malformed `/api/version` is `audiomuse_error` (invalid version response); a deployment
  outside 3.7.x is `audiomuse_error` naming the supported minor and baseline.
  With one supported minor, a loaded calibration always matches the deployment's minor,
  so discovery has no separate stale-minor check and `calibrated` is true whenever a
  calibration is loaded.
- Versions must be canonical (no leading zeros); `major.minor` compares as a string.
- Fixtures report v3.7.4; tests cover v3.7.1 calibration on v3.7.4, v3.8.0 rejection,
  and malformed or non-canonical deployment and calibration versions.
