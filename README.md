# Navidrome MCP

Create ordered Navidrome playlists from song lists through a local MCP client.
The service matches tracks, saves drafts, previews changes, and records publishing
outcomes. It connects to an existing Navidrome instance using MCP over stdio.

## Docker Compose

Requires Docker with Compose.

```sh
cp .env.docker.example .env
# Edit .env with your Navidrome URL, username, and Subsonic password.
chmod 600 .env
docker compose build
```

Keep your existing `.env` if already configured. For Navidrome on the Docker host,
use `http://host.docker.internal:4533`; Navidrome must listen on an interface the
container can reach. Single-quote passwords containing `$` or `#` in `.env`.

Add this to your MCP client's configuration, replacing the absolute paths:

```json
{
  "mcpServers": {
    "navidrome": {
      "command": "docker",
      "args": [
        "compose",
        "--project-directory",
        "/absolute/path/to/navidrome-mcp",
        "--file",
        "/absolute/path/to/navidrome-mcp/compose.yaml",
        "--env-file",
        "/absolute/path/to/navidrome-mcp/.env",
        "run",
        "--rm",
        "-T",
        "navidrome-mcp"
      ]
    }
  }
}
```

For a manual foreground launch:

```sh
docker compose run --rm -T navidrome-mcp
```

The service waits for MCP messages on stdin. Use `compose run` for each client
connection; `compose up -d` provides no MCP endpoint.

## Local setup

Requires Node **26.13.0** (see `.nvmrc`) and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm build
cp .env.example .env
# Edit .env with your Navidrome credentials and an absolute NAVIDROME_DB_PATH.
node --env-file=.env dist/cli.js
```

For an MCP client, use `node` as the command and pass
`--env-file=/absolute/path/to/.env` and `/absolute/path/to/dist/cli.js` as arguments.

## Configuration

Required: `NAVIDROME_URL`, `NAVIDROME_USERNAME`, and `NAVIDROME_PASSWORD`.
Use the server's HTTP(S) base URL without `/rest` or embedded credentials.

Optional settings, including request timeouts and search limits, are listed in
[.env.example](.env.example). Set `NAVIDROME_REQUIRE_APPROVAL=true` to require an
agent assertion that the user approved the exact preview revision. Keep credentials
in the process environment or `.env`, outside tool arguments.

## Workflow

1. Call `check_connection`, then `resolve_tracks` with songs containing `title` and
   `artist` (optionally `album`, `version`, and `duration`).
2. Review matches. Explicitly select ambiguous tracks or omit unwanted entries;
   missing or incomplete searches must not be silently treated as resolved.
3. Use `save_playlist_draft`, then `preview_playlist`. Drafts default to public;
   set `visibility: "private"` when needed.
4. Call `publish_playlist` with the previewed revision and a stable `operationKey`.
   Check `data.status`: only `succeeded` confirms publication.

Publishing creates a new playlist. Repeated requests return the recorded operation;
use `copy_playlist_draft` to intentionally create another playlist.

For incomplete operations, inspect `get_operation` and use `reconcile_operation`.
Resume a known playlist ID; an `unknown_outcome` requires explicitly adopting a
verified playlist or confirming non-creation before retrying. A new operation key
cannot bypass recovery.

## Storage and upgrades

Docker stores SQLite in the `playlist-data` volume at `/data/playlists.sqlite`.
Local runs default to `.data/playlists.sqlite`. Keep the same server URL and
username for an existing database; host databases are not automatically imported
into Docker.

Pending database migrations run automatically at startup in one transaction.
Failure rolls back the migration and stops startup. Before upgrading, stop clients
and back up the database, then rebuild with `docker compose build --pull` and
reconnect. Retain the volume: `docker compose down --volumes` deletes stored state.
Rollback requires restoring the pre-upgrade backup.

## Development

See the [architecture](docs/architecture.md) for system boundaries, the
[project map](docs/project-map.md) for code navigation, and the
[coding standards](docs/coding-standards.md) for implementation conventions and
testing expectations.

```sh
pnpm check             # formatting, lint, typecheck, build, all tests
pnpm test:watch        # integration tests while editing
pnpm test:coverage     # coverage report
```

## Optional AudioMuse discovery

AudioMuse-AI is separately managed; this service does not install models or trigger
analysis. The adapter is validated against **v3.7.1**. Explicit song-list workflows
remain available when AudioMuse is absent or unavailable.

Set `AUDIOMUSE_URL`, `AUDIOMUSE_API_TOKEN`, and `AUDIOMUSE_SERVER` together. The server
may be its ID or display name, and must point to the same Navidrome base URL.
`AUDIOMUSE_BUDGET_MS` defaults to 60000 and covers the entire attempt, including
Navidrome validation. Requests are sequential with no automatic retries, share one
deadline, and retrieve at most 200 candidates per reference and 5,000 per expansion.

`check_audiomuse_connection` checks authentication, selected-server binding, version,
and whether calibration is configured. Discovery requires
`AUDIOMUSE_CALIBRATION_PATH`, pointing to a JSON file such as:

```json
{
  "audiomuseUrl": "https://audiomuse.example.com",
  "navidromeUrl": "https://music.example.com",
  "server": "your-navidrome-server-id",
  "version": "v3.7.1",
  "indexModel": "identify the deployed MusicNN/CLAP models, index, and metric",
  "report": "path or reference to your measured calibration report",
  "maxDistance": 0.1,
  "minDescriptionSimilarity": 0.6
}
```

**The numeric values above illustrate the format; they are not calibrated
recommendations.** Measure suitable quality floors against representative
single-style and mixed-style playlists for your index/model. Distances and CLAP
similarities are separate measures. Recalibrate when models, index settings, metric,
release, or library change. Deployment URLs and server selection must match the
report, and the runtime rejects a changed release. Version and coverage do not
fingerprint an index build: operators must invalidate calibration after model or
index changes. Without a report, discovery returns `calibration_required`.

Use `discover_tracks` for a listening description or `find_similar_tracks` for a
library-track ID. Results contain `recommendations`, separate from requested-song
candidate matches, plus target, shortfall, and candidate-limit information. To
accept a recommendation, pass its `track.id` as `trackId` and preserve its
`recommendation` metadata in a `save_playlist_draft` entry, alongside the track's
title and artist as `request`.

Draft edits preserve existing recommendation provenance when it is unspecified.
Pass `recommendation: null` on an explicit selection to make that occurrence a
supplied song instead. Releasing a recommendation removes it from explicit
references unless it has also become a supplied song.

For expansion:

1. Save the supplied songs and resolve every occurrence by selection or omission.
2. Call `expand_playlist_draft` with `draftId`, the current `revision`, a stable
   `requestKey`, and `mode: "regenerate"` or `mode: "add_more"`. Regeneration replaces
   unretained recommendations; add-more explicitly appends another batch. Reuse
   identical input and the same key for transport retries, including after restart.
3. Use `configure_playlist_discovery` to set the complete `retainedTrackIds` list
   and/or explicit `referenceTrackIds` set. Unspecified fields preserve choices.
   Removing a reference keeps its playlist occurrence. Retain a recommendation
   before making it a reference. An explicit empty reference set prevents expansion.
4. Preview the returned revision and publish through the existing workflow.

Defaults target one addition per distinct supplied selection, capped at 20.
Explicit counts target 1–100 new additions; retained recommendations are additional
to the regeneration target. The 500-entry draft limit includes omissions and
repetitions. Results report shortages and capacity limits without relaxing quality.
Original order and repetitions survive; recommendations append without duplicate
IDs. The preview identifies additions through `recommendation`, including retention,
reference attribution, and uncertain alternate identities.

Alternate filtering uses matching artists and normalized recording titles to
exclude confidently identified alternate recordings. Similar titles alone do not
establish identity; uncertain versions remain visible for review. Set
`allowAlternateVersions: true` to override filtering. A similarity/availability 404
is ambiguous on v3.7.1 and fails conservatively with the reference ID, preserving
the draft. Other upstream failures, budget exhaustion, and concurrent edits also
apply no partial additions. Missing analysis is never silently skipped.

Compose forwards the optional AudioMuse settings from `.env`. Calibration paths
must exist **inside the container**; use a Compose override to bind-mount your
calibration file read-only, then set `AUDIOMUSE_CALIBRATION_PATH` to its container
path. Keep credentials in `.env`, and rebuild the image to include new tools and
migrations.

### Appending to an existing playlist

Use `list_playlists` to disambiguate names, then `save_playlist_update` with a
`playlistId`, ordered `entries`, and optional separate `references`. References
guide discovery and are not appended. Entries use the same requested-song,
`trackId`, and explicit omission fields as creation drafts. Edits replace these
lists using `draftId` and `expectedRevision`; `retainedTrackIds` optionally sets
which recommendations regeneration protects. `recommendation: null` makes an
occurrence an explicit requested addition.

Use `expand_playlist_update` for balanced recommendations, then
`preview_playlist_update` and `apply_playlist_update` for that exact revision.
Persist request and operation keys across retries. The preview includes the full
resulting order, repetition warnings, separate references, and discovery
shortfalls. Existing playlist size does not consume the 500 addition slots.
Explicit updates work without AudioMuse.

A target conflict requires `refresh_playlist_update` and a new preview.
An uncertain append blocks every update to that target in this database.
`get_update_operation` exposes original, intended, and observed states, classifies their relationship,
and reports metadata, ordered-position, and occurrence-count differences. Reconciled
operations retain the comparison observed when the decision was made.
`reconcile_playlist_update` requires a stable recovery key, current recovery
version, reason, and `cannotStillExecute: true`. Choose `accept_intended`,
`accept_current` (closes without success), or `retry` with `didNotApply: true`.
These assertions must follow external investigation; playlist contents alone do
not establish request completion. The service never repairs or rolls back an
unexpected result. Intentional later additions require a fresh update draft.

Appends preserve name and visibility and send only ordered additions to the
existing ID. Conflict detection is best effort against other Navidrome clients.
Compatibility of ordering, repeated IDs, metadata preservation, and ownership
restrictions on the deployed Navidrome version still requires release validation;
local HTTP fixtures do not establish deployed compatibility.

For Navidrome 0.64.2, full JSON playlist responses omit `public` when false.
The adapter recognizes that version's full responses and preserves private
visibility. Missing visibility from other server versions or minimal responses
remains unknown and prevents appending until compatibility is established.
