# Navidrome Playlists

Turn explicit song lists into ordered playlists in a user's Navidrome library.

## Language

**Requested song**:
An occurrence in the user's ordered song list describing the recording they want, with a title and artist and optional album, version, or duration. Repeated songs are separate requested songs.
_Avoid_: Track ID, library track

**Library track**:
A specific recording available in the user's Navidrome library, identified by its Navidrome song ID. Different versions of a song may be different library tracks.
_Avoid_: Requested song

**Playlist**:
A named, ordered collection of library tracks in Navidrome.

**Playlist update**:
A proposed addition of library tracks to an existing playlist, preserving its existing tracks, order, name, and visibility. Explicit requested-song occurrences remain separate additions even when the same library track is already present.
_Avoid_: Publishing

**Update draft**:
A revisable proposal to append tracks to one existing playlist, with its original playlist state, proposed additions, and recommendation references kept distinct. A successfully applied update draft represents that same update when requested again; an intentional further append requires a new update draft.
_Avoid_: Playlist draft, playlist

**Candidate match**:
A library track that may satisfy a requested song, but has not yet been selected for it.
_Avoid_: Selected track

**Recommended track**:
A library track suggested because it fits a listening description or other songs, rather than as a match for a requested song. A recommendation is not a selection until accepted into a playlist draft.
_Avoid_: Candidate match

**Playlist expansion**:
Adding recommended tracks to a playlist draft based on a supplied song list.

**Reference track**:
A distinct library track chosen to guide recommendations by its sound; it need not be included in the destination playlist. Supplied songs establish the initial reference tracks; retaining a recommendation does not itself make it a reference track.

**Retained recommendation**:
A recommended track the user explicitly chose to keep in a playlist draft. It is protected from replacement when recommendations are regenerated.

**Ambiguous requested song**:
A requested song with multiple plausible candidate matches and no selected track. It requires an explicit selection or omission before publishing.

**Missing requested song**:
A requested song for which matching found no suitable candidate. It requires an explicit omission or a revised request rather than silent exclusion.

**Selected track**:
The library track explicitly chosen for a requested song, or accepted through an agreed matching rule.
_Avoid_: Candidate match

**Omission**:
An explicit decision to leave a requested song out of the playlist without substituting another recording.
_Avoid_: Missing song, failed match

**Publishing**:
Creating a new playlist in Navidrome from the selected library tracks in their requested order, excluding explicit omissions.
_Avoid_: Updating a playlist

**Draft revision**:
A specific version of a playlist draft or update draft, including its proposed contents, selections, omissions, reference choices, and applicable target or metadata. Approval, publishing, and applying an update refer to that version rather than to future changes.
_Avoid_: Preview revision

**Preview**:
A read-only presentation of an exact draft revision for review before publishing or applying a playlist update.

**Approval assertion**:
The external agent's statement that the user approved a specific draft revision when human confirmation is required.
_Avoid_: Independently verified human approval

**Playlist draft**:
A proposed playlist whose requested songs can be selected, omitted, or reordered before publishing, producing at most one Navidrome playlist. Each change produces a new revision; an intentional additional playlist requires a copy of the draft.
_Avoid_: Playlist

**Locked draft**:
A draft that can no longer be edited because its creation request may have reached Navidrome. Recovery concerns that same publication; changes require copying the draft.

**Publish operation**:
A recorded attempt to publish a specific draft revision, including its outcome and the resulting playlist identity when known.
_Avoid_: Playlist draft, playlist

**Unknown outcome**:
A publish outcome where the service cannot establish whether playlist creation succeeded. It requires reconciliation before another creation attempt.
_Avoid_: Failed creation

**Verification failure**:
A publish outcome where a created playlist's track order or contents differ from the intended revision. The playlist remains available for inspection.
_Avoid_: Successful publication

**Visibility**:
Whether a playlist is public or private in Navidrome. New drafts default to public and may explicitly select private.

**Recovery decision**:
An explicit assertion that an unknown creation outcome should be reconciled by adopting a specified, verified playlist or by authorizing another creation attempt because the previous attempt did not create one.
_Avoid_: Automatic retry
