# Project map

Start with the area that owns the change. This map provides navigation; system
boundaries live in [architecture](architecture.md), and implementation conventions
live in [coding standards](coding-standards.md).

| Area                             | Start here                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and assembly             | [CLI](../src/cli.ts), [configuration](../src/config.ts), and [composition root](../src/app.ts).                                                                                                                                 |
| MCP transport                    | [src/mcp/](../src/mcp/) for registration, descriptions, annotations, and result mapping.                                                                                                                                        |
| Playlist workflows and contracts | [src/playlists/](../src/playlists/) for shared schemas/types, public service dispatch, matching, publication, and recovery. [updates.ts](../src/playlists/updates.ts) owns existing-target append, refresh, and reconciliation. |
| External integrations            | [src/navidrome/](../src/navidrome/) for the Navidrome adapter; [src/discovery/](../src/discovery/) for AudioMuse and recommendation workflows.                                                                                  |
| Persistence                      | [src/database/](../src/database/) for storage, typed schema, and migration execution; [drizzle/](../drizzle/) for reviewed SQL upgrades.                                                                                        |
| Behavior tests                   | [tests/integration/](../tests/integration/) for public service workflows and upgrades; [tests/e2e/](../tests/e2e/) for stdio and process lifecycle; [tests/support/](../tests/support/) for shared fixtures.                    |
| Domain and decisions             | [GLOSSARY.md](../GLOSSARY.md), [docs/adr/](adr/), and [agent guidance](agents/).                                                                                                                                                |

For specs and issues, follow [tracker conventions](agents/issue-tracker.md) before
accessing the local tracker.

For tooling, use [package.json](../package.json) and [.nvmrc](../.nvmrc) for runtime
and dependency requirements, [TypeScript](../tsconfig.json) and
[build configuration](../tsconfig.build.json) for compilation,
[ESLint](../eslint.config.js) and [Prettier](../.prettierrc.json) for mechanical
rules, and [Vitest configuration](../vitest.config.ts) for test projects.
[Dockerfile](../Dockerfile) and [Compose](../compose.yaml) define packaging;
the [README](../README.md) owns setup and usage.

Update this map when these entry points move or their responsibilities change.
Use the code and active feature spec to establish supported behavior rather than
maintaining a second feature inventory here.
