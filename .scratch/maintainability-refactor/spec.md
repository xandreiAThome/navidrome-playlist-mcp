# Maintainability refactor

Authorized by `$implement /tmp/navidrome-mcp-handoff-kx3f1qo9.md`.
Review baseline: db955ca12266770dd2851d048f5a553035a04e3d.

Preserve all product behavior in ../playlist-service/spec.md, with the persistence
implementation superseded by Drizzle ORM and better-sqlite3. Preserve wire results,
all twelve tools, immutable revisions, operation keys, atomic publication claims,
worker ownership and leases, explicit recovery history, and credential redaction.

- Use Vitest projects for integration and compiled-CLI MCP/crash tests. Retain real
  SQLite, fake Navidrome HTTP, and existing public test seams. Add watch and coverage.
- Group cohesive source under playlists, navidrome, database, and mcp. Compose
  dependencies in app.ts; keep CLI and configuration small.
- Use typed Drizzle queries and explicit immediate transactions. Commit versioned
  SQL migrations under drizzle and upgrade existing databases without losing state.
  Store operational fields in columns; validate retained JSON snapshots.
- Share Zod tool schemas with typed handlers, replace string dispatch, and use
  discriminated results and constrained statuses. Preserve publication transitions.
- Add ESLint, Prettier, a complete pnpm check, a pinned supported Node LTS, and CI.
- Update installation, migration and development docs and ADR 0001. Verify upgrades,
  concurrency and crash recovery, review standards/spec independently, fix findings,
  and commit on the current branch.
