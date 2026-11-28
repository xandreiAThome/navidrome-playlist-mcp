# Code organization

Status: Accepted. New code follows this agreement; existing code adopts it as it
changes.

This document decides where code lives. System boundaries and guarantees live
in the [architecture](architecture.md), entry points in the
[project map](project-map.md), and implementation rules in
[coding standards](coding-standards.md).

## Structure proportional to complexity

Add structure only when the code needs it. This is one TypeScript package with a
handful of capabilities; most capabilities need a folder of plain modules, not
layers of interfaces, repositories, or mappers. A workflow may call `Storage` and
an adapter directly. Introduce an abstraction when a second real implementation
or a test seam requires it, not in anticipation.

## Capability folders

Organize `src/` by the capability that owns the code, not by technical kind.
Do not create top-level `src/types/`, `src/models/`, `src/utils/`,
`src/helpers/`, or `src/common/` folders, or files such as `domain.ts` or
`types.ts` that collect whatever several modules need. Role-based grouping
belongs inside a capability; see [role subfolders](#role-subfolders).

| Folder           | Owns                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `src/tools/`     | The public tool contract (input schemas, output data, result envelope) and dispatch to owners. |
| `src/mcp/`       | MCP registration: tool descriptions, annotations, and result mapping. No workflow policy.      |
| `src/playlists/` | Playlist drafts, matching, publishing, playlist updates, and their operation journals.         |
| `src/discovery/` | AudioMuse adapter, recommendations, playlist expansion, and calibration.                       |
| `src/navidrome/` | The Navidrome adapter: authentication, bounded requests, and upstream response validation.     |
| `src/database/`  | `Storage`, the Drizzle schema, and migration execution. SQL migrations live in `drizzle/`.     |
| `src/setup/`     | The interactive `setup` subcommand: its steps, prompts, flags, and MCP client installation.    |

A new capability gets its own folder when it has several modules with a shared
responsibility. A table, tool, or upstream endpoint does not automatically need
one.

## Role subfolders

Inside a capability, group modules by role so a file's folder says what it is
responsible for. Use the same names everywhere, matching the
[responsibilities](#responsibilities-and-dependency-direction) below:

- `records/`: schemas and types the capability owns, whether persisted,
  returned, or imported by other capabilities.
- `adapters/`: clients for an external service, with their request bounds,
  response validation, and compatibility checks.
- `rules/`: pure logic with no I/O, such as matching or cutoff proposals.

Workflow classes stay at the capability root (`service.ts`, `updates.ts`,
`publication.ts`), so a capability's entry points are the first files listed.
A capability whose roles differ, such as `setup/`, uses names for its own
roles instead, and documents them in the table below.

Add role subfolders once a capability has more than about four modules; a
capability with a few clearly named files stays flat. Do not create an empty
or single-purpose scaffold for every role. Avoid giving two modules in one
capability the same filename in different subfolders.

```text
src/playlists/
  publication.ts         publish a draft as a new playlist
  updates.ts             append to and reconcile an existing playlist
  records/
    drafts.ts            draft revisions, entries, update state
    operations.ts        publish and update operation journals
  rules/
    matching.ts          requested song to candidate match

src/discovery/
  service.ts             recommendations, expansion, and calibration
  adapters/
    audiomuse.ts         AudioMuse HTTP client
    audiomuse-release.ts supported AudioMuse releases
  records/
    calibration.ts       saved calibrations, bindings, ratings
    results.ts           discovery and expansion results
  rules/
    calibration-cutoffs.ts  staleness and cutoff proposals

src/setup/
  main.ts                `setup` command entry
  run.ts                 orders the steps
  flags.ts               non-interactive flags
  steps/                 one module per setup step, plus shared URL prompts
  prompts/               the prompt interface and its terminal implementation
  install/               the MCP server entry and the add-mcp installer
```

## Root modules

Keep only bootstrap code and genuinely shared vocabulary at the `src/` root:

- `cli.ts` is the process entry point; `app.ts` is the composition root that
  assembles dependencies and owns their lifecycle.
- `config.ts` owns the `Config` type and its loading from the environment;
  `base-url.ts` holds the base URL rule that configuration and setup share.
- `problem.ts` owns `Problem`, its codes, and the JSON details it carries.
- `library.ts` owns the glossary's library values that every capability shares:
  requested songs, library tracks, candidate matches, and remote playlists.

Promote a value to the root only when several capabilities use it and it has no
better owner. Keep root modules small and single-purpose.

## Types and schemas live with their owner

Define a schema or type in the module of the capability that owns its meaning,
even when other capabilities import it. For example, draft revisions live in
`playlists/records/drafts.ts`, operation journals in
`playlists/records/operations.ts`, expansion results in
`discovery/records/results.ts`, and saved calibrations in
`discovery/records/calibration.ts`. `Storage` imports those schemas to validate
persisted JSON; it does not own them.

Put records in the capability's `records/` folder when other modules import
them or they are substantial. Otherwise keep a type beside its single
consumer.

## Public tool contract

`src/tools/` is the single owner of the agent-facing contract:

- `inputs.ts` holds one strict Zod schema per tool in `toolSchemas`, and derives
  `ToolName` and `ToolInput` from it. Input-only schemas live here; schemas that
  are also persisted or returned stay with their owner.
- `outputs.ts` holds `ToolData` (each tool's result), `Result`, and
  `ToolHandlers`.
- `service.ts` holds `PlaylistService`, which validates input, dispatches each
  tool to its owning workflow or adapter, and converts failures into results.

`src/mcp/` depends on `tools/` and never the reverse. Workflows may use
`ToolInput<...>` and `ToolData[...]` to type their public methods.

### Adding a tool end to end

1. Add the input schema to `toolSchemas` in `tools/inputs.ts` and the result
   type to `ToolData` in `tools/outputs.ts`.
2. Implement the behavior in the owning capability, such as a method on
   `Updates` or `Discovery`. Put new records in that capability's modules.
3. Map the tool to that method in the handler table in `tools/service.ts`.
4. Register its description and annotations in `mcp/server.ts`.
5. Cover the workflow through `createApp(...).execute(...)` in
   `tests/integration/`, and the registration in `tests/e2e/mcp.test.ts` when
   the serialized contract changes.

TypeScript rejects a tool missing from the handler table, so steps 1 and 3 fail
loudly when incomplete.

## Responsibilities and dependency direction

Follow the dependency direction in the [architecture](architecture.md):
transport calls workflows, workflows use adapters and storage, and the
composition root wires them together.

- **Transport** (`mcp/`, `tools/service.ts`) validates input and maps results.
- **Workflows** (`playlists/`, `discovery/service.ts`) own policy: drafts,
  revisions, write authorization, verification, and recovery.
- **Adapters** (`navidrome/`, `discovery/adapters/`) own HTTP mechanics and
  validate upstream responses. They do not decide whether a write is
  authorized.
- **Storage** (`database/`) owns SQL, transactions, and work claims.
- **Rules** (`playlists/rules/`, `discovery/rules/`) stay free of I/O.
- **Records** (`*/records/`) hold schemas and types, with no behavior beyond
  validation.

Importing a type across capabilities is fine. Importing behavior should follow
the direction above. Restructure circular runtime dependencies rather than
accepting them; type-only cycles are tolerated but should not grow.

## Imports and entry points

Import directly from the module that defines a name, using relative paths with
the `.ts` extension and `import type` for type-only imports. Do not add
`index.ts` barrel files; a capability's public surface is the set of modules
other capabilities already import. Do not re-export a name from a module that
does not own it.

## Files and folders

Use short, descriptive kebab-case filenames that name what the module owns
(`drafts.ts`, `calibration-cutoffs.ts`); the role subfolder already says its
kind, so do not repeat it in the filename. Established names stay: `service.ts`
for a capability's workflow class, `client.ts` for a single-adapter capability
such as `navidrome/`, `schema.ts` for the Drizzle schema.

Start a module with a one-line `//` comment when its name alone does not say
what it owns. Split a module when it holds unrelated responsibilities, not
merely when it is long.

## Tests

Tests live outside `src/`, grouped by the seam they exercise, as the
[coding standards](coding-standards.md) describe:

- `tests/integration/` exercises public service workflows, configuration,
  setup steps, and database upgrades in-process.
- `tests/e2e/` runs the compiled application over stdio or as a child process.
- `tests/support/` holds shared fixtures, such as fake Navidrome and AudioMuse
  servers. Fixtures used by one test file stay in that file.

Name a test file after the behavior or capability it covers, not after a
private module.

## Adoption and enforcement

Apply this agreement to new code and to areas a change materially touches.
Do not move code solely for cosmetic consistency. When a move changes where a
module lives, update the [project map](project-map.md) in the same change.

TypeScript, ESLint, Prettier, and the test suite (`pnpm check`) enforce the
mechanical rules. The placement rules in this document are review-enforced;
do not describe them as automated checks.
