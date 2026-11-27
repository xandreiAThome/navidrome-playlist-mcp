# Distribute as an npm package

Status: ready-for-agent

Blocked by: [audiomuse-3.7.4](../audiomuse-3.7.4/spec.md).
Decision record: [ADR 0005](../../docs/adr/0005-distribute-via-npm-with-setup-command.md).
Followed by [setup-cli](../setup-cli/spec.md) and
[guided-calibration](../guided-calibration/spec.md).

## Problem Statement

Installing requires a checkout plus pnpm builds or Docker Compose with volumes and
bind mounts. Self-hosters who run Navidrome should install with one `npx` command.

## Solution

Publish `@xandreiathome/navidrome-playlist-mcp` to npm, remove Docker, give the
database a per-user default location, and verify the packed artifact in CI on Linux,
macOS, and Windows. Behavior and guarantees are unchanged.

## User Stories

- As a self-hoster, I run the server through `npx` without cloning or building.
- As a user who never sets `NAVIDROME_DB_PATH`, every MCP client shares one database
  regardless of its working directory.
- As a former Docker user, I can copy my database out of the `playlist-data` volume.
- As the maintainer, pushing a `v*` tag publishes a verified package with provenance.

## Implementation Decisions

- `package.json`: remove `private`; name `@xandreiathome/navidrome-playlist-mcp`;
  `bin` → `dist/cli.js`; `files` → `dist`, `drizzle`; `publishConfig.access:
  public`. Keep better-sqlite3 + Drizzle and `engines.node >=26.13.0`.
- `build` removes `dist/` first with a cross-platform Node one-liner; stale outputs
  (e.g. `dist/domain.js`) must not ship. Migrations resolve from `../../drizzle/`
  relative to `dist/database/`, so `drizzle/` ships at the package root.
- Default database path when `NAVIDROME_DB_PATH` is unset:
  `$XDG_DATA_HOME` or `~/.local/share` on Linux, `~/Library/Application Support` on
  macOS, `%LOCALAPPDATA%` on Windows; directory `navidrome-playlist-mcp`, file
  `playlists.sqlite`. Implemented locally without a dependency.
- The binary reads only process environment; `.env` remains a `pnpm dev`
  convenience.
- Remove `Dockerfile`, `compose.yaml`, `compose.override.yaml`,
  `.env.docker.example`, and Docker/Compose content from README,
  `docs/calibration.md`, `docs/discovery.md`, `docs/playlist-workflows.md`, and
  `docs/project-map.md`. `.scratch` history is unchanged.
- Migration notes (documentation only, no detection code): users of the old
  `./.data/playlists.sqlite` default set `NAVIDROME_DB_PATH` or move the file;
  Docker users copy the database out of the `playlist-data` volume.
- Until `setup-cli` ships, the README documents manual client configuration with
  `npx -y @xandreiathome/navidrome-playlist-mcp@<version>`.
- CI: keep full `pnpm check` on ubuntu; add a job that runs `npm pack`, installs the
  tarball in a clean directory, starts the binary, and completes the MCP
  `initialize` handshake on ubuntu, macos, and windows.
- Release: a workflow on `v*` tags publishes with npm trusted publishing (OIDC) and
  provenance, after the checks pass.
- Later: publish `server.json` to the official MCP Registry (`mcpName` in
  `package.json`, `mcp-publisher` in the release workflow), marking
  `NAVIDROME_PASSWORD` and `AUDIOMUSE_API_TOKEN` secret.

## Testing Decisions

- Unit-test the data-directory resolution per platform via injected platform/env.
- The pack smoke test is the packaging test; existing e2e tests stay source-based.

## Out of Scope

- The `setup` command, calibration changes, lowering the Node requirement, and
  replacing better-sqlite3.

## Further Notes

Human prerequisites: an npm account `xandreiathome`, and trusted publishing
configured for the GitHub repository on npmjs.com.
