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

## Private target: blocked by visibility evidence

Playlist ID: `3Te1v06VguehZNvJLLLfni`.

The first dedicated baseline creation returned this known playlist ID, but
publication stopped as incomplete during visibility verification. After explicitly
setting private visibility, both getPlaylist and getPlaylists omitted the public
field. Neither response provided an explicit false value. The owner matched the
configured account and the baseline contained two tracks.

Operation ID: `e0aa5510-3851-4516-a281-9c3a76d6041d`.
Recorded reason: visibility_not_verified; expectedPublic=false; actualPublic=null.

No append was attempted on this target. The adapter intentionally represents an
absent visibility field as unknown, and the update workflow requires known
visibility. Treating omission as private needs authoritative server-contract
evidence and a deliberate adapter change; this run did not weaken that guarantee.

## Remaining limits and remote artifacts

Live validation is partial: public append compatibility passed, but private-target
compatibility did not pass. Read access alone does not establish write permission.
Owner-account append worked for the public test target; denial for another owner's
playlist was not tested because no separately authorized second-account fixture
was configured. No existing user playlist was modified.

Both dedicated test playlists remain on the server for inspection. They are named
with the prefix “MCP append validation”, a UTC timestamp, and their intended
visibility. The private baseline's visibility remains unknown to this adapter.
Neither playlist was deleted, and no automatic recovery, repair, or blind append
retry was performed.
