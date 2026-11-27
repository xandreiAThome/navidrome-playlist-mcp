# Accept AudioMuse 3.7.x with minor-release calibration staleness

Status: ready-for-agent
Blocked by: 01

Replace the `v3.7.1` literals in config validation and the discovery service with a
single supported-release constant. Accept 3.7.x deployments; treat a calibration as
stale only when its minor release differs from the deployment's. Update fixtures and
tests per the spec's testing decisions.

## Comments
