# Releasing

Pushing a `v*` tag runs [the release workflow](../.github/workflows/release.yml).
It reruns [the checks](../.github/workflows/check.yml), including the
cross-platform pack smoke test. It then publishes
`@xandreiathome/navidrome-playlist-mcp` to npm with trusted publishing (OIDC) and
provenance. No npm token is stored in the repository.

1. Set `version` in `package.json` to the new version and commit it on `main`.
2. Tag that commit with the same version and push the tag:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

The workflow fails before publishing if the tag does not match the
`package.json` version.

npmjs.com trusts publishes only from `.github/workflows/release.yml` in
`xandreiAThome/navidrome-playlist-mcp`, with no GitHub environment. Renaming the
workflow or adding an environment requires the same change in the package's
trusted-publisher settings on npmjs.com.
