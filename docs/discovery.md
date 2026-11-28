# AudioMuse discovery

AudioMuse-AI is separately managed; this service does not install models or trigger
analysis. The adapter supports **3.7.x** releases and is validated against **v3.7.5**;
other minor releases are rejected until validated. Explicit song-list workflows
remain available when AudioMuse is absent or unavailable.

Set `AUDIOMUSE_URL`, `AUDIOMUSE_API_TOKEN`, and `AUDIOMUSE_SERVER` together.
Get `AUDIOMUSE_SERVER` from the `server_id` of your Navidrome entry in
AudioMuse's `GET /api/servers` response. With the variables loaded in your shell:

```sh
curl -fsS -H "Authorization: Bearer $AUDIOMUSE_API_TOKEN" \
  "${AUDIOMUSE_URL%/}/api/servers" |
  jq '.servers[] | {server_id, name, server_type}'
```

You can also use the display name. The selected connection must point to the
same Navidrome base URL as this service.
`AUDIOMUSE_BUDGET_MS` defaults to 60000 and covers the entire attempt, including
Navidrome validation. Requests are sequential with no automatic retries, share one
deadline, and retrieve at most 200 candidates per reference and 5,000 per expansion.

`check_audiomuse_connection` checks authentication, selected-server binding, version,
and each scale's calibration. Discovery also requires calibration: no default
quality cutoffs ship, and an uncalibrated or stale scale returns
`calibration_required`. Ask your assistant to calibrate recommendations;
[calibration](calibration.md) explains the scales, staleness, and when to
recalibrate.

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
is ambiguous on 3.7.x and fails conservatively with the reference ID, preserving
the draft. Other upstream failures, budget exhaustion, and concurrent edits also
apply no partial additions. Missing analysis is never silently skipped.
