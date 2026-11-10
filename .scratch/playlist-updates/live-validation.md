# Live Navidrome append validation — 2026-11-10

The user explicitly authorized live validation in the implementation conversation.
Validation used the configured account and dedicated test playlists through the
built application's public service interface. Credentials and server address are
excluded from this record.

Server: Navidrome **0.64.2 (10114574)**, Subsonic protocol **1.16.1**.

## Public target: passed

Playlist ID: `22sK2qT4malUUkE0XUl08X`.

The service created a dedicated public baseline containing two distinct library
tracks, A and B, then previewed and applied additions A, C, C. A fresh read
confirmed exactly A, B, A, C, C. Name and public visibility were preserved.
The normal append adapter sent only playlistId and ordered songIdToAdd parameters.

Repeating application returned the same successful operation and left the exact
five-occurrence result unchanged. A fresh empty update returned no_changes and
left the target unchanged. Explicit additions worked with AudioMuse disabled.

Detailed public-operation IDs and ordered track IDs are in
[live-validation.json](live-validation.json); the durable service journal is
`live-validation.sqlite` in this directory.

## Private target: passed after visibility compatibility fix

Playlist ID: `3Te1v06VguehZNvJLLLfni`.

The first dedicated baseline creation returned this known playlist ID, but
publication stopped as incomplete during visibility verification. After explicitly
setting private visibility, both getPlaylist and getPlaylists omitted the public
field. Neither response provided an explicit false value. The owner matched the
configured account and the baseline contained two tracks.

Operation ID: `e0aa5510-3851-4516-a281-9c3a76d6041d`.
Recorded reason: visibility_not_verified; expectedPublic=false; actualPublic=null.

The initial run stopped before append. Follow-up source inspection established
that Navidrome 0.64.2 serializes its boolean playlist visibility with
`json:"public,omitempty"`: false is omitted. Its full response builder assigns
the actual visibility and includes owner and readonly metadata; minimal-client
responses return before those fields are populated.

Primary sources pinned to the deployed version:

- [Playlist response declaration](https://github.com/navidrome/navidrome/blob/v0.64.2/server/subsonic/responses/responses.go#L280).
- [Full versus minimal response builder](https://github.com/navidrome/navidrome/blob/v0.64.2/server/subsonic/playlists.go#L117).

The adapter now normalizes missing visibility to false only for a Navidrome
0.64.2 response with owner and readonly fields. Explicit booleans take precedence.
Other servers, versions, and minimal responses retain unknown visibility. A
public-service regression test reproduces the original failure and proves the
supported private case succeeds while unsupported omissions prevent writes.

After rebuilding, explicit recovery resumed the original known creation
operation and verified private visibility. A new update on that target appended
A, C, C to the original A, B baseline. Fresh reads verified exactly A, B, A, C, C,
unchanged name, and private visibility. Repeated application returned the same
successful operation and left contents unchanged. AudioMuse was disabled.

## Remaining limits and remote artifacts

Live public and private append compatibility passed on the deployed version.
Owner-account writes succeeded. Cross-account denial remains untested: no
second-account credentials are configured. No existing user playlist was modified.

Both dedicated validation playlists were deleted after completion, following the
user's authorization to finish validation and cleanup. Each deletion checked the
exact target ID, validation-name prefix, and configured ownership first. A fresh
playlist listing confirmed each target absent. Cleanup evidence is recorded in
[live-validation.json](live-validation.json). The local journal remains available
for audit; its successful operations refer to the now-deleted test playlists.
