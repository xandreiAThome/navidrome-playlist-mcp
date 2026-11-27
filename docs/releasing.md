# Releasing

Pushing a `v*` tag runs [the release workflow](../.github/workflows/release.yml).
It reruns [the checks](../.github/workflows/check.yml), including the
cross-platform pack smoke test. It then stages
`@xandreiathome/navidrome-playlist-mcp` on npm with trusted publishing (OIDC) and
provenance. No npm token is stored in the repository. A staged version stays
private until the maintainer approves it with 2FA.

1. Set `version` in `package.json` to the new version and commit it on `main`.
2. Tag that commit with the same version and push the tag:

   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```

3. After the workflow succeeds, approve the staged version, either on the
   package's page on npmjs.com or from a terminal:

   ```sh
   npm stage list @xandreiathome/navidrome-playlist-mcp
   npm stage approve <stage-id>
   ```

   To inspect the tarball first, run `npm stage download <stage-id>`. To
   discard it, run `npm stage reject <stage-id>`.

The workflow fails before staging if the tag does not match the `package.json`
version.

npmjs.com trusts staged publishes only from `.github/workflows/release.yml` in
`xandreiAThome/navidrome-playlist-mcp`, with no GitHub environment and with direct
publishing disallowed. Renaming the workflow or adding an environment requires the
same change in the package's trusted-publisher settings on npmjs.com.
