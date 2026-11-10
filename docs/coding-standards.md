# Coding standards and implementation conventions

These rules capture the repository's existing contracts and implementation
patterns for changes and reviews. Mechanical settings remain authoritative in
[package.json](../package.json), [TypeScript configuration](../tsconfig.json),
[ESLint configuration](../eslint.config.js), and
[Prettier configuration](../.prettierrc.json). Module ownership is documented in
the [architecture guide](architecture.md); domain meanings and architectural
guarantees remain authoritative in the glossary and ADRs linked there.

## Contracts and module boundaries

- Follow the existing ESM source convention: relative imports use `.ts`, and
  imports used only as types use `import type`. The build rewrites relative
  extensions for emitted JavaScript.
- Define public tool inputs with strict Zod object schemas and derive input types
  from those schemas. Keep tool-name, handler, and output mappings correlated;
  update the shared contract, service handler, and MCP registration together.
- Treat network and persisted JSON as untrusted data. Validate the relevant
  response shape before using it and verify requested identities, such as returned
  song and playlist IDs. Upstream envelopes may tolerate extra vendor fields;
  public command inputs retain explicit accepted fields.
- Keep casts narrow and explain any type-system limitation they bridge. The
  indexed schema/handler dispatch assertion is an existing example; it preserves
  a correlation already established by the tool map rather than replacing runtime
  validation.
- Keep MCP transport code focused on registration and result mapping. Put
  workflow policy in the service/publication/discovery owners, HTTP mechanics in
  adapters, and local transactions in storage. Assemble dependencies in the
  composition root; matching logic remains independent of I/O.
- Use the glossary's distinction between requested songs, candidate matches,
  selected tracks, and recommended tracks. Represent ordered requested-song
  occurrences as occurrences; recommendation deduplication does not authorize
  deduplicating explicit requests.

## Errors and external I/O

- Use `Problem` with an actionable code, safe message, and structured details for
  expected domain failures. The public service converts these to result values,
  validation failures to invalid input, and unexpected exceptions to a generic
  internal error. Preserve this boundary when adding handlers.
- Distinguish tool execution from workflow outcome. An outer `status: ok` means
  the handler returned data; publication data has its own status, and only
  `succeeded` establishes publication success. A shortage is a valid discovery
  result; an upstream failure is an error that preserves the draft.
- Keep credentials in process configuration. Sanitize upstream exceptions and
  response bodies before they reach results, journals, or diagnostics. Navidrome
  request URLs carry authentication material; forwarding raw fetch errors can
  disclose it. Keep stdout available for MCP messages and diagnostics on stderr.
- Bound external work and propagate abort signals through the complete discovery
  operation, including Navidrome validation. Preserve the adapters' rejection of
  redirects and their safe error conversion. Current adapters make no automatic
  request retries; adding retry behavior must account for deadlines and remote
  write uncertainty.
- Preserve configured-server/account binding and AudioMuse media-server checks.
  A recommendation is accepted only after validation against the configured
  Navidrome library. Missing analysis and no matches are not interchangeable;
  ambiguous upstream failures remain failures rather than valid shortages.

## Drafts, persistence, and recovery

- Save edits as new immutable revisions using the expected current revision.
  A new revision starts unpreviewed. Preview and optional approval refer to the
  exact revision; asynchronous matching or discovery must not overwrite a newer
  edit. Preserve recommendation provenance and explicit reference choices.
- Compute expansion before committing it. Save its resulting revision and retry
  receipt in the same local transaction. Failed discovery leaves the source
  unchanged; reusing a key with different input is a conflict, not another batch.
- Keep database access behind storage. Use Drizzle for typed application queries
  and reviewed SQL for schema evolution. Retain explicit operational state columns
  alongside validated JSON journals where coordination depends on those columns.
- Add schema changes as a new ordered SQL migration, register it in the migration
  runner, and update the Drizzle declarations together. Preserve earlier migrations
  so existing databases can advance through the same history. Migration startup
  must keep its immediate transaction, rollback behavior, and newer-schema check.
- Preserve immediate transactions and conditional owner/lease updates for work
  claims and recovery. Perform network I/O outside synchronous SQLite
  transactions. A process-local flag cannot replace durable coordination across
  clients sharing a database.
- Preserve the publication policy in
  [ADR 0002](adr/0002-journal-publication-and-stop-on-unknown-creation.md): journal
  before creation, retain a known remote identity immediately, and recover the
  recorded operation rather than creating another playlist on a transport retry.
  A lease expiry or a new request key does not establish that creation failed.
- Verify the intended ordered track IDs, repetitions, name, and visibility before
  claiming publication success. Keep explicit omission and ambiguous/missing-song
  resolution meaningful; do not silently substitute or discard requested songs.
- Keep new-playlist publication and planned existing-playlist updates distinct.
  [ADR 0004](adr/0004-append-to-existing-playlists.md) defines future update rules;
  do not assume its target snapshots or reference-only inputs already exist in
  the current implementation.

## Tests and completion

- Prefer the public `createApp(...).execute(...)` seam with real local HTTP
  fixtures and SQLite for service behavior. Use stdio MCP tests for registration,
  serialized contracts, process lifecycle, and coordination/crash behavior that
  cannot be established within one service instance.
- Assert observable outputs, exact remote effects, write counts, state across
  restart, and forbidden additional writes where relevant. Exercise real adapters
  against controlled HTTP responses instead of mocking private methods. Existing
  legacy-upgrade tests seed old database state deliberately, then observe behavior
  through the public service.
- Cover migration compatibility and persisted retry/recovery semantics when
  storage changes. Include concurrent instances or killed workers when a change
  affects operation ownership. Register fixture and service cleanup with the test
  lifecycle so HTTP listeners, child processes, and databases are released.
- Run the relevant integration tests during implementation and `pnpm check`
  before completing code changes. The package scripts own the exact command
  composition; stdio tests run the compiled application. For documentation-only
  changes, check touched Markdown formatting, local links, and whitespace without
  requiring the runtime suite.
- Treat local fixtures as reproducible behavior tests, not proof of compatibility
  with a deployed upstream version. Record any needed compatibility or quality
  evidence separately; use the active spec to determine release validation scope.

## Keeping the guidance current

Change shared contracts, their behavior tests, and affected tool descriptions in
the same change. When moving a module or changing its ownership, update the
architecture map. Link feature specs to shared conventions rather than copying
them. Keep runtime versions and mechanical rules in configuration, decision
rationale in ADRs, domain terms in the glossary, and setup instructions in the
README. If a feature requires changing an existing guarantee, make that trade-off
explicit in its design before presenting it as an established convention.
