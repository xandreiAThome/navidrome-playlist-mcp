# Navidrome MCP

A local MCP service that lets external agents turn explicit song lists into
ordered Navidrome playlists. It matches library tracks, stores versioned drafts,
previews them, and journals publishing so uncertain writes are not blindly retried.

The first version serves one user and one Navidrome account. It creates new
playlists through MCP over stdio; the agent supplies the conversational interface.
There is no browser UI, embedded model, HTTP listener, or existing-playlist editor.

## Install and build

Requires Node **26.13.0 or later** and pnpm. This project uses Node's built-in
SQLite API, whose release-candidate status is an accepted architectural choice.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Configure the variables below in your MCP client's process environment. For a
direct launch, copy `.env.example` to the ignored `.env` file, fill it in, and use:

```sh
node --env-file=.env dist/cli.js
```

The process reads environment variables; it does not load `.env` automatically.
It speaks MCP on stdin/stdout, so a direct launch waits for an MCP client.

## Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `NAVIDROME_URL` | Required server base URL, including any reverse-proxy prefix | None |
| `NAVIDROME_USERNAME` | Required Navidrome username | None |
| `NAVIDROME_PASSWORD` | Required password usable for Subsonic token/salt authentication | None |
| `NAVIDROME_DB_PATH` | SQLite file; use an absolute path in MCP configuration | `.data/playlists.sqlite` under the working directory |
| `NAVIDROME_REQUIRE_APPROVAL` | Require an agent assertion of human approval (`true` or `false`) | `false` |
| `NAVIDROME_TIMEOUT_MS` | Per-request timeout, 100–60000 milliseconds | `15000` |
| `NAVIDROME_SEARCH_PAGE_SIZE` | Search page size, 1–500 | `100` |
| `NAVIDROME_SEARCH_MAX_PAGES` | Maximum pages per search, 1–100 | `20` |

Use an HTTP(S) base URL without embedded credentials, query, or fragment. Do not
append `/rest`. Authentication derives a fresh Subsonic token and salt from the
configured password for each request. Instance-specific authentication settings
must permit that method. Redirects are rejected; configure the final server URL.

Credentials remain in the service process. Tool schemas do not accept them, and
results contain neither credentials nor raw upstream errors or library file paths.
Stdout is reserved for MCP. Startup diagnostics go to stderr without raw errors.
`.env`, build output, dependencies, and SQLite files are ignored by Git.

The database is bound to the configured server URL and username, preventing
accidental recovery against another account. Password rotation does not change
that binding. Use a separate database when changing server or account. SQLite
files are created with owner-only permissions; keep the database and its journal
files together and retain them across launches.

## Connect an MCP client

Build first, then use your client's equivalent of this configuration. Replace
paths, URL, username, and password with your actual local settings; the URL below
is an example, not a detected instance.

```json
{
  "mcpServers": {
    "navidrome": {
      "command": "node",
      "args": ["/absolute/path/to/navidrome-mcp/dist/cli.js"],
      "env": {
        "NAVIDROME_URL": "http://localhost:4533",
        "NAVIDROME_USERNAME": "your-user",
        "NAVIDROME_PASSWORD": "your-password",
        "NAVIDROME_DB_PATH": "/absolute/path/to/navidrome-mcp/.data/playlists.sqlite"
      }
    }
  }
}
```

Use the client's secret environment injection when available. Cloud agents need a
local connector capable of launching this command; they cannot reach your
localhost directly. This version provides no network MCP transport.

## Tools

| Tool | Input and behavior |
| --- | --- |
| `check_connection` | `{}`; checks connectivity and authentication |
| `search_tracks` | `{query}`; returns tracks and a `complete` flag |
| `resolve_tracks` | `{songs: [{title, artist, album?, version?, duration?}]}`; one resolution per input occurrence |
| `list_playlists` | `{}`; lists IDs and metadata; duplicate names are permitted |
| `get_playlist` | `{playlistId}`; returns ordered tracks and visibility |
| `save_playlist_draft` | `{name, visibility?, entries, draftId?, expectedRevision?}`; creates or replaces a complete draft revision |
| `get_playlist_draft` | `{draftId, revision?}`; reads the current or a historical revision |
| `copy_playlist_draft` | `{draftId, revision, name?}`; creates a separate editable draft |
| `preview_playlist` | `{draftId, revision}`; presents and records the exact current revision |
| `publish_playlist` | `{draftId, revision, operationKey, approval?}`; starts once or returns the existing operation |
| `get_operation` | `{operationId}`; reads progress, outcome, and recovery version |
| `reconcile_operation` | `{operationId, action, recoveryKey, expectedRecoveryVersion, playlistId?, reason?}`; performs deliberate recovery |

A draft entry is `{request: {title, artist, album?, version?, duration?}, trackId?}`
or `{request: {...}, omit: true}`. Without a selection or omission, the service
attempts automatic resolution. It fetches all explicitly selected IDs from
Navidrome and stores its own metadata snapshot. Repeated entries stay separate.

Saving an existing draft requires both `draftId` and `expectedRevision`. This is
a full replacement: include the desired name, visibility, and complete ordered
entries, including omissions. Visibility defaults to **public** when omitted.
Every edit creates a new revision and invalidates the previous preview.

Expected problems return structured results such as:

```json
{"status":"stale_revision","message":"Reload the current draft before editing."}
```

Successful tool execution returns `{"status":"ok","data":...}`. For publishing,
**inspect `data.status`**: it describes the durable operation and may be `creating`,
`unknown_outcome`, `incomplete`, `verification_failed`, or `succeeded`. An `ok`
tool result alone does not mean a playlist was successfully published.

## Workflow example

1. Call `check_connection`, then `resolve_tracks` with structured requested songs.
2. Review `selected`, `ambiguous`, `missing`, or `incomplete` results. Ask the user
   to choose uncertain recordings or explicitly omit a request. Revise the request
   when necessary; never silently substitute or drop a song.
3. Save the ordered draft. For example:

   ```json
   {
     "name": "Evening",
     "visibility": "public",
     "entries": [
       {"request":{"title":"Teardrop","artist":"Massive Attack"},"trackId":"actual-library-id"},
       {"request":{"title":"Unavailable song","artist":"Artist"},"omit":true}
     ]
   }
   ```

4. Preview with the returned `draftId` and `revision`. Review the name, visibility,
   selected tracks, order, repeated occurrences, and explicit omissions.
5. Publish that exact revision with a stable `operationKey`. When confirmation is
   enabled, also send `approval: {revision: 1, confirmed: true}`, using the actual
   revision approved by the user. This trusts the agent's assertion; it is not an
   independently authenticated human approval channel.
6. Inspect the operation status and retain its ID. Poll `get_operation` if needed.

Publishing rejects stale or unpreviewed revisions, unresolved entries, and empty
results before writing. It revalidates selected track metadata against the preview.
A library change requires saving and previewing a new revision.

Once creation may have begun, the draft locks. Repeated publication requests,
including alternate keys, return the same operation. Keys cannot be reused for
another draft or revision. Copy the draft to intentionally create another playlist.

## Matching limits

Matching uses direct paginated Navidrome searches, conservative Unicode/case/
punctuation normalization, and title/artist comparisons. Optional album and
version constraints narrow candidates; a supplied duration must be within two
seconds. Recognized version suffixes remain distinct; a neutral title with studio
and live candidates is ambiguous. A sole versioned alternative is not silently
substituted for an unqualified exact title.

Search behavior depends on Navidrome's backend and library tags. Completeness
means pagination finished for that query, not that the entire library was proven
to contain no other spelling or tagging variants. Reaching a page limit reports
`incomplete` and prevents automatic selection or a false missing result. The agent
may search again and explicitly choose a valid library ID. No external music
catalogue, audio analysis, or mood inference is used.

## Publishing and recovery

Creation, setting visibility, and verification are separate Navidrome requests.
The service verifies name, ordered IDs (including repetitions), and visibility
after writing. The server's initial visibility may differ briefly from the desired
setting. A visibility failure remains incomplete with the known playlist ID.
Content/order mismatch reports `verification_failed` with differences and retains
the playlist; it never automatically deletes or rewrites its contents.

There is no server idempotency key for new playlist creation. A lost response or
crash without a recorded playlist ID therefore becomes `unknown_outcome` and
blocks further creation. Names are not proof of identity or non-creation.

Operations use durable worker leases so separate MCP processes sharing the same
database do not create concurrently. After an abrupt crash, wait for the lease
to expire (`3 * NAVIDROME_TIMEOUT_MS + 10000` milliseconds from the last recorded
step); an active worker returns `operation_busy` to recovery requests.

Read `get_operation` before deciding how to reconcile. Every recovery decision
requires a stable `recoveryKey` and the current `expectedRecoveryVersion`. An
accepted decision increments `recoveryVersion` and is recorded durably. Repeating
the same decision key returns the recorded operation without running it again.
To make another deliberate decision after a failed attempt, inspect the new
version and use a new key.

- **Known ID, incomplete or failed verification:** use `action: "resume"` to
  retry visibility and verification without another creation. Content mismatch
  remains a failure until the actual playlist matches; resume does not rewrite it.
- **Unknown outcome, identified playlist:** use `action: "adopt"`, supply
  `playlistId` and `reason`. The service checks name and ordered track IDs before
  adopting, then applies visibility and completes verification.
- **Unknown outcome, confirmed non-creation:** use `action: "confirm_not_created"`
  with an explicit assertion in `reason`. The service revalidates the stored
  selection, records the decision, and authorizes one further creation attempt.

Recovery decisions are trusted agent/operator assertions. The service cannot
prove non-creation, and an incorrect assertion can cause a duplicate. A new
publication key alone never bypasses an unknown outcome.

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tests exercise the public service against real SQLite and a local fake Navidrome
HTTP server, plus real MCP clients and subprocesses over stdio. They cover lost
responses, restarted services, concurrent processes, and killed workers. They do
not contact or validate your actual Navidrome instance. The test environment must
permit ephemeral loopback sockets and local subprocesses.

The agreed spec lives in `.scratch/playlist-service/spec.md`; domain vocabulary
is in `GLOSSARY.md`, with architectural decisions in `docs/adr/`.
