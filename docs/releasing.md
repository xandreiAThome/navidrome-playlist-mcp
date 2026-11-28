# Releasing

Pushing a `v*` tag runs [the release workflow](../.github/workflows/release.yml).
It reruns [the checks](../.github/workflows/check.yml), including the
cross-platform pack smoke test. It then stages
`@xandreiathome/navidrome-playlist-mcp` on npm with trusted publishing (OIDC) and
provenance. No npm token is stored in the repository. A staged version stays
private until the maintainer approves it with 2FA.

Choose the version from the commits since the last tag: a breaking change
(`!` or `BREAKING CHANGE`) bumps the minor version while the package is `0.x`,
and anything else bumps the patch version. The examples use `0.2.0`.

1. Merge the pull requests going into the release, then update `main` and check
   it:

   ```sh
   git switch main && git pull
   pnpm check
   ```

2. Bump the version, commit, and tag in one step:

   ```sh
   npm version 0.2.0 -m "chore(release): %s"
   ```

   This sets `version` in `package.json`, commits it as
   `chore(release): 0.2.0`, and creates the annotated tag `v0.2.0`. It refuses
   to run with uncommitted changes.

3. Push the commit and its tag together; the tag starts the release workflow:

   ```sh
   git push --follow-tags
   ```

   If `main` is protected against direct pushes, put the version commit through
   a pull request instead, then push the tag once it merges.

4. Watch the workflow:

   ```sh
   gh run watch
   ```

5. After the workflow succeeds, approve the staged version, either on the
   package's page on npmjs.com or from a terminal:

   ```sh
   npm stage list @xandreiathome/navidrome-playlist-mcp
   npm stage approve <stage-id>
   ```

   To inspect the tarball first, run `npm stage download <stage-id>`. To
   discard it, run `npm stage reject <stage-id>`.

6. Confirm the published version runs:

   ```sh
   npx -y @xandreiathome/navidrome-playlist-mcp@0.2.0 setup --help
   ```

7. Optionally, publish release notes on GitHub. Lead with breaking changes and
   anything that cannot be rolled back, such as a database migration:

   ```sh
   gh release create v0.2.0 --title "v0.2.0" --notes-file notes.md
   ```

The workflow fails before staging if the tag does not match the `package.json`
version; `npm version` keeps them in step.

npmjs.com trusts staged publishes only from `.github/workflows/release.yml` in
`xandreiAThome/navidrome-playlist-mcp`, with no GitHub environment and with direct
publishing disallowed. Renaming the workflow or adding an environment requires the
same change in the package's trusted-publisher settings on npmjs.com.
