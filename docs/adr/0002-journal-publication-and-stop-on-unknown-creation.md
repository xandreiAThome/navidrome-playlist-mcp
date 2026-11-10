# Journal publication and stop on unknown creation

Persist drafts, revisions, and publish operations locally across restarts. A draft produces at most one Navidrome playlist: repeat publication requests return its recorded operation, while intentional additional playlists require copying the draft. Publishing requires the exact preview revision, revalidates selected tracks, rejects empty results, and never silently substitutes or omits a requested song.

Navidrome playlist creation has no documented idempotency key, so a timeout or crash around creation may leave an unknown outcome. Block further creation for that draft until an explicit recovery decision either adopts a specified playlist after verification or asserts non-creation and authorizes another attempt; a new request key cannot bypass this block. Duplicate playlist names are allowed and cannot establish identity.

Create the playlist, explicitly apply the revision's visibility (public by default, private when requested), and verify ordered track IDs including repetitions and visibility. Retain the playlist ID immediately when known, so subsequent recovery can resume remaining steps without creating another playlist. A content or ordering mismatch is a verification failure, and a visibility failure is an incomplete operation; return structured details and the known playlist ID without automatic deletion.

This prioritizes avoiding silent duplicate writes over automatic recovery from every transport failure. Recovery assertions are trusted input from the agent, not proof that a previous request did not execute.

References: [createPlaylist](https://opensubsonic.netlify.app/docs/endpoints/createplaylist/), [updatePlaylist](https://opensubsonic.netlify.app/docs/endpoints/updateplaylist/), [getPlaylist](https://opensubsonic.netlify.app/docs/endpoints/getplaylist/).
