# Agent-driven Navidrome playlist service

Status: ready-for-agent

This is the consolidated design confirmed in the design interview. It is the
implementation and review specification; see `GLOSSARY.md` and `docs/adr/`.

## Scope and runtime

- Serve one user and one Navidrome account.
- External agents interpret conversations and send structured requested songs.
- Implement a local MCP stdio command in TypeScript using Node, pnpm, the official
  MCP server SDK, and Drizzle ORM with better-sqlite3 behind a small storage module
  (superseded by the authorized maintainability refactor; see ADR 0001).
- Do not add HTTP/network transports, browser UI, an embedded agent, Docker,
  multi-user access, mood discovery, or editing existing Navidrome playlists.
- Read server URL, credentials, database location, and optional confirmation policy
  from process configuration. Never accept credentials through tools or expose
  them in tool results or logs. Keep stdout exclusively for MCP.

## Matching and drafts

- Requested songs require title and artist, with optional album, version, and
  duration. Preserve input order and repeated occurrences.
- Search Navidrome directly. Normalize conservatively, preserving meaningful
  version distinctions. Auto-select only a unique clear match satisfying supplied
  constraints. Return selected, ambiguous, or missing outcomes with candidate
  metadata. Incomplete searches must not imply uniqueness or absence.
- Validate all explicitly selected IDs against actual library tracks; never trust
  caller-provided track metadata. Explicit selections resolve ambiguity; revising
  a request or explicitly omitting it resolves missing songs. No silent omissions
  or substitutions. Each repeated occurrence has its own selection or omission.
- Persist drafts, entries, revisions, previews, and publishing operations locally.
- Support name, visibility, and ordered tracks only. Visibility defaults to public
  and may be private. Duplicate playlist names are allowed.
- Version name, visibility, requests, order, selections, and omissions. Require the
  expected current revision on edits and reject stale edits. Preserve history.
- A preview presents an exact revision. Publishing requires the current revision
  to have been previewed. Changes invalidate that preview and its approval.
- Reject unresolved entries and empty selected results before any Navidrome write.
- Before writing, revalidate selected track identities and relevant metadata.
  Disappeared or changed tracks require a new draft revision and preview.
- Publishing needs no human confirmation by default. When enabled, require an
  agent assertion of human approval for that exact revision; this is explicitly
  a trusted assertion, not an independently authenticated human approval channel.

## Publication and recovery

- Each draft produces at most one playlist. Repeat publish requests return its
  recorded operation regardless of a new request key. Copy drafts for intentional
  additional playlists. Reject operation-key reuse with incompatible requests.
- Atomically claim the draft before any possible creation request. Lock it once
  creation may have begun; preflight rejection before a write leaves it editable.
- Persist enough state to survive restarts and serialize concurrent publishers,
  including multiple local processes sharing the database.
- Create a new playlist preserving order and repetitions; retain its ID as soon
  as known, explicitly set visibility, and fetch to verify the playlist name,
  ordered IDs (including repetitions), and visibility.
- Persist intent before creation. Timeout/crash/uncertain response without a known
  playlist ID yields unknown outcome. Never automatically retry uncertain creation
  or identify the result solely by its name.
- Known playlist IDs permit resuming incomplete visibility/verification work
  without creating again. Verification mismatch returns the ID and differences;
  never report it as success or automatically delete the playlist.
- Unknown outcomes block creation until an explicit recorded recovery decision:
  adopt a specified existing playlist after verifying it against the revision, or
  assert the previous creation did not occur and authorize another attempt.
- A fresh request key cannot bypass unknown outcomes. Recovery assertions are
  trusted input, not proof that a prior write did not execute.
- Return structured statuses and actionable details for expected problems,
  including stale revisions, unresolved songs, incomplete publication, and unknown
  outcomes. Do not require agents to parse prose for workflow decisions.

## MCP tools

- `check_connection`
- `search_tracks`
- `resolve_tracks`
- `list_playlists`
- `get_playlist`
- `save_playlist_draft`
- `get_playlist_draft`
- `copy_playlist_draft`
- `preview_playlist`
- `publish_playlist`
- `get_operation`
- `reconcile_operation`

## Delivery

Provide installation, configuration, MCP launch, workflow, matching limitations,
and recovery documentation. Use meaningful public-interface tests, typecheck
regularly, run the full suite at completion, review standards and specification
coverage independently, fix findings, and commit on the current branch.
