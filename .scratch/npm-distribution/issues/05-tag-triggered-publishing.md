# Publish on version tags with trusted publishing

Status: resolved
Blocked by: 02, 04

Add a workflow that publishes on `v*` tags with OIDC trusted publishing and
provenance after checks pass. Needs the npm account and npmjs.com trusted-publisher
configuration, which only the maintainer can do.

## Comments

The maintainer configured the npm account and trusted publisher on 2026-11-27.
The workflow assumes the trusted publisher names `release.yml` with no
environment. The workflow is
`.github/workflows/release.yml`, and the release steps are in `docs/releasing.md`.

Following npm's recommendation, the trusted publisher allows only staged
publishing. The workflow runs `npm stage publish`, and the maintainer approves each
version with 2FA. Version 0.1.0 was published manually from `11cf902`.
