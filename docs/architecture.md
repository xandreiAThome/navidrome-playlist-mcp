# Architecture and project map

This guide describes the implemented service. Use [ADRs](adr/) for decision
rationale, the [glossary](../GLOSSARY.md) for domain language, and
[coding standards](coding-standards.md) when changing or reviewing code.

## Runtime boundary and stack

One locally launched process serves an external agent over MCP stdio for one
configured Navidrome account. The external agent interprets conversation; this
service owns structured matching, draft revisions, discovery, publication, and
recovery. There is no embedded AI runtime, browser UI, or listening HTTP server.
Docker packages the same stdio process; each client connection launches a process
with access to the persistent database. See [README](../README.md) for setup.

| Concern                  | Implementation and authoritative configuration                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language and runtime     | TypeScript compiled to Node.js ESM; runtime/package-manager requirements and dependencies are in [package.json](../package.json), with the local runtime pin in [.nvmrc](../.nvmrc). |
| Compiler and build       | [tsconfig.json](../tsconfig.json) checks source and tests; [tsconfig.build.json](../tsconfig.build.json) emits application code.                                                     |
| Agent protocol           | Official MCP server SDK over stdio; the official client SDK exercises the transport in tests.                                                                                        |
| Validation and contracts | Zod schemas define tool inputs, domain snapshots, and relevant upstream response shapes.                                                                                             |
| Persistence              | SQLite through better-sqlite3 and Drizzle ORM, with reviewed SQL migrations.                                                                                                         |
| External services        | Navidrome's Subsonic-compatible HTTP API and optional, separately managed AudioMuse-AI, using Node's fetch.                                                                          |
| Verification             | Vitest, Node assertions, local HTTP fixtures, and real SQLite; configured in [vitest.config.ts](../vitest.config.ts).                                                                |
| Mechanical standards     | [ESLint](../eslint.config.js) and [Prettier](../.prettierrc.json); [package scripts](../package.json) own check commands.                                                            |
| Packaging                | [Dockerfile](../Dockerfile) compiles the app and includes migrations and the native SQLite binding; [Compose](../compose.yaml) supplies configuration and persistent storage.        |

Exact versions and mechanical options belong in those source files. The reasons
for the stack and local service boundary are in [ADR 0001](adr/0001-external-agents-drive-a-local-playlist-service.md).

## Request and state flow

1. The CLI validates environment configuration, assembles the application, and
   connects MCP stdio. The composition root creates storage and the two adapters,
   then supplies publication and discovery to the playlist service.
2. The MCP registry supplies tool metadata and input schemas. Calls reach the
   service's public `execute` interface, which parses input and dispatches a typed
   handler. The service converts expected problems and validation failures into
   structured results and hides unexpected error details.
3. Matching searches the configured Navidrome library and interprets candidates.
   Draft saves collect selected tracks or explicit omissions and commit a new
   revision through storage. Preview records review of the exact current revision.
4. Optional discovery validates calibration, upstream version, and media-server
   binding, retrieves recommendations, and validates their track IDs and metadata
   against Navidrome. Expansion commits one new revision and its retry receipt
   together after successful discovery; it does not write remote playlists.
5. Publication validates the previewed revision, claims a persistent operation,
   creates the remote playlist, records its identity, applies visibility, and
   verifies the result. Recovery operates on the journaled revision and known
   identity where available. [ADR 0002](adr/0002-journal-publication-and-stop-on-unknown-creation.md)
   defines the creation and recovery guarantees.

The transport is an adapter over the service, not the owner of matching or write
policy. HTTP adapters own authentication, request construction, deadlines, and
response interpretation. Storage owns local revision consistency and operation
coordination. The composition root owns dependency assembly and initial cleanup;
the service closes storage on shutdown.

## Persistence and concurrency

The database is bound to the normalized configured Navidrome URL and username.
Changing credentials for the same account does not change that identity; reusing
the database for a different server or account is rejected. Filesystem setup,
SQLite pragmas, and connection ownership are encapsulated by storage.

Draft revision snapshots are immutable validated JSON, with current revision,
preview, and lock state tracked separately. Publication operations keep a validated
JSON journal alongside explicit queryable state columns, ownership tokens, and
leases. Successful expansion receipts couple a request fingerprint with its
committed revision, allowing transport retries across restarts.

Immediate transactions coordinate local changes across processes sharing the
database. Owner-conditional updates protect active publication and recovery work;
lease expiry is conservatively exposed as an unknown or incomplete operation.
SQLite coordination cannot make a remote HTTP request transactional. Recovery
assertions are trusted agent input, and playlist names cannot establish identity.

Startup applies ordered SQL migrations in one immediate transaction, including
the migration version check. Migration failure rolls back and prevents startup;
a database newer than the application is rejected. ORM table declarations describe
typed queries, while migration SQL describes upgrades to existing databases.

## Project map

| Location                                                                                    | Responsibility and starting point                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/cli.ts](../src/cli.ts), [src/config.ts](../src/config.ts), [src/app.ts](../src/app.ts) | Process lifecycle, environment/calibration validation, and dependency assembly. Start here for startup or wiring changes.                                                       |
| [src/mcp/server.ts](../src/mcp/server.ts)                                                   | MCP registration, descriptions, annotations, and structured result mapping.                                                                                                     |
| [src/playlists/domain.ts](../src/playlists/domain.ts)                                       | Zod contracts, inferred types, problem codes, tool-name/input/output mappings, draft and publication snapshots. This currently also houses discovery contracts.                 |
| [src/playlists/service.ts](../src/playlists/service.ts)                                     | Public tool execution, matching/draft orchestration, and safe error conversion.                                                                                                 |
| [src/playlists/matching.ts](../src/playlists/matching.ts)                                   | Candidate interpretation and recording/version matching without I/O.                                                                                                            |
| [src/playlists/publication.ts](../src/playlists/publication.ts)                             | New-playlist write lifecycle, revalidation, verification, and explicit recovery.                                                                                                |
| [src/navidrome/client.ts](../src/navidrome/client.ts)                                       | Authenticated Navidrome HTTP requests, bounded search, track/playlist reads, creation, and visibility changes.                                                                  |
| [src/discovery/audiomuse.ts](../src/discovery/audiomuse.ts)                                 | AudioMuse HTTP/authentication and selected media-server verification.                                                                                                           |
| [src/discovery/service.ts](../src/discovery/service.ts)                                     | Calibration checks, recommendation validation/filtering/allocation, reference configuration, and atomic draft expansion.                                                        |
| [src/database/](../src/database/)                                                           | Storage API, Drizzle schema, and startup migration runner.                                                                                                                      |
| [drizzle/](../drizzle/)                                                                     | Ordered reviewed SQL migrations, shipped with the compiled app.                                                                                                                 |
| [tests/integration/](../tests/integration/)                                                 | Public service behavior, discovery, persistence, and upgrades using local HTTP fixtures and SQLite.                                                                             |
| [tests/e2e/](../tests/e2e/), [tests/support/](../tests/support/)                            | Real stdio MCP workflows and process failure/concurrency tests; reusable Navidrome HTTP and legacy-database fixtures. AudioMuse fixtures currently live in the discovery suite. |
| [docs/adr/](adr/), [GLOSSARY.md](../GLOSSARY.md), [docs/agents/](agents/)                   | Architectural decisions, domain terminology, and conditional agent guidance.                                                                                                    |
| [.scratch/](../.scratch/)                                                                   | Local specs and implementation issues; read [tracker conventions](agents/issue-tracker.md) before accessing or publishing them.                                                 |

The build emits `dist/`; coverage and runtime database artifacts are generated.
Deployment-bound calibration and credentials remain local. Use the repository's
ignore files as the authoritative artifact exclusions.

## Current behavior versus planned extensions

Publication currently creates new playlists. The Navidrome adapter's existing
playlist mutation changes visibility as part of that workflow; it does not append
tracks to existing playlists. [ADR 0004](adr/0004-append-to-existing-playlists.md)
records the agreed future update design, not an implemented capability.

Current expansion references must be selected supplied tracks or retained
recommendations in the playlist draft. Reference-only songs outside destination
contents are part of that planned update extension. The glossary describes the
broader agreed concept; current tool schemas and handlers determine availability.

AudioMuse discovery is implemented and optional. Historical planning language in
[ADR 0003](adr/0003-optional-audiomuse-discovery.md) predates implementation;
current setup and adapter compatibility are documented in the README. Discovery
requires deployment-bound calibration. An operator must invalidate calibration
after index/model changes that the runtime version check cannot detect.
