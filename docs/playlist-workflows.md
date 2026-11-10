# Playlist workflows

## Create a playlist

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

## Extend an existing playlist

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
