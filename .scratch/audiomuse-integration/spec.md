# AudioMuse-AI discovery and playlist expansion

Agreed by the user after the design interview. Planning is complete; implementation is not authorized.

## Agreed scope

- Discover library tracks from a listening description.
- Discover library tracks similar to a supplied library track.
- Turn a supplied list of requested songs into a playlist draft and add recommended tracks that fit the playlist.
- Connect to an optional AudioMuse-AI instance managed separately by the user. Installation, model downloads, and library analysis are outside this MCP's ownership.
- Route recommendations through the existing draft, preview, and publication workflow, retaining the current publication policy and recovery guarantees.
- Preserve the supplied songs' order and append recommendations by default.
- Recommendations should cover the different styles represented in the supplied list rather than target one average sound.
- Unless the user specifies a count, aim for one addition per distinct selected library track from the supplied list, capped at 20 additions. Omissions do not count, and explicit repetitions do not inflate the target.
- Resolve all supplied songs through explicit selections or omissions before using the list to guide expansion. Do not silently recommend from a resolved subset.
- An instruction to add fitting songs authorizes automatic selection of recommendations into the draft. The preview identifies recommended additions separately from supplied songs; individual recommendation approval is not required.
- Recommended additions exclude library track IDs already selected in the draft and do not repeat track IDs. Explicit repetitions in the supplied list remain intact.
- When fewer suitable recommendations are available than requested, use the available recommendations and report the shortfall. Do not pad the result with weaker matches.
- If AudioMuse fails, preserve the resolved original songs as an available draft, explicitly report expansion as unsuccessful, and allow a deliberate expansion retry.
- By default, additions exclude confidently identified alternate recordings of songs already supplied, including live versions and remasters. An explicit request for alternate versions may override this policy.
- Give each distinct selected original roughly equal opportunity to contribute recommendations; redistribute unused slots when an original has few matches. Do not let one original dominate merely because it has more close candidates.
- If a selected original lacks AudioMuse analysis, stop expansion and identify the track while preserving the original draft. Proceeding without that track's influence requires an explicit decision; it does not imply omitting the original from the playlist.
- Explicit regeneration replaces the prior recommended additions while preserving supplied songs. A failed regeneration leaves the current draft intact. Appending another batch requires an explicit add-more instruction.
- Recommendations explicitly retained by the user are protected from regeneration. Only recommendations not explicitly retained are replaced.
- Alternate-recording filtering excludes confidently identified alternate versions; uncertain identities remain visible for review. Similar titles alone are insufficient, and the limitation must be disclosed.
- An explicit count means the number of new additions targeted, up to 100 additions per request. The existing 500-entry draft limit applies; report shortfalls and capacity limits explicitly. Add-more excludes all tracks already in the draft.
- Any upstream request failure makes the expansion attempt fail without changing the draft. A successful search with few suitable candidates is a shortage and may redistribute unused slots; it is not an upstream failure.
- Additions must pass a minimum sound-similarity threshold, calibrated against representative playlists before release. The requested count is a target, subordinate to match quality.
- Supplied songs establish the reference tracks for subsequent expansions. Retained recommendations remain protected but influence discovery only when explicitly added to the reference set.
- The configurable overall expansion time budget defaults to 60 seconds and includes retries. Exhausting the budget fails the attempt and preserves the current draft.

The service boundary is recorded in ADR 0003. A recommended track is distinct from a candidate match for a requested song.

## Planned workflow

1. Resolve the ordered supplied songs using existing matching, explicit selection, and omission rules. Preserve their occurrences and relative order.
2. Save the resolved original draft. Establish distinct reference tracks and the requested addition count.
3. Establish that every reference track can guide discovery on the selected AudioMuse server and index. A proven missing analysis or an ambiguous availability failure stops expansion with an actionable report. Explicitly excluding a reference track from discovery preserves its selected playlist occurrence.
4. Retrieve recommendations with bounded work within the overall time budget. Give each reference track roughly equal opportunity, deduplicate additions, filter confidently identified alternate recordings, apply the calibrated quality threshold, and validate returned library track IDs against Navidrome.
5. Redistribute unused slots across reference tracks with remaining qualifying candidates. Return a valid shortage when available candidates cannot fill the target; do not relax the quality threshold to reach the count.
6. Apply a successful expansion to one new draft revision using the expected source revision. A concurrent edit must not be overwritten. Preserve originals and retained recommendations; append the newly selected additions. Report the target, actual additions, any shortage or capacity limit, and uncertain alternate-recording identities. An unsuccessful attempt applies no partial additions.
7. Preview the exact resulting revision, identifying supplied songs and recommended additions. Publish only through the existing publication service and policy.

Regeneration targets the replacement batch; retained recommendations remain present and are excluded from new candidates. Add-more targets an additional batch and excludes all current selected tracks. Repeating a transport request must not silently perform add-more. Draft provenance and reference choices must survive restart and copying a draft.

Description-based discovery and single-track similarity produce library-track recommendations usable in the same draft workflow. Candidate matches resolve specific requested recordings; recommended tracks suggest additions. These meanings must remain distinct in tool results and previews.

## Technical plan and prerequisites

- Add an optional AudioMuse HTTP client with configuration for base URL, bearer API token, selected media server, and time budget. Keep credentials in process configuration and redact upstream errors. Bind requests consistently to the same configured Navidrome server.
- Expose connectivity, description-based discovery, single-track similarity, and playlist expansion through MCP. Tool names and schemas remain implementation details; tools must make errors, shortages, and draft mutations explicit.
- Use the existing draft revision and publication guarantees. Adding recommendation provenance, retention, and reference choices requires a reviewed storage migration that preserves existing drafts and publication journals.
- Evaluate per-reference similarity queries and balanced merging as a candidate implementation. Direct use of Alchemy alone does not meet the agreed coverage and analysis-availability policies.
- Use v3.7.1 as the inspected compatibility baseline, not a promise of compatibility with other releases. Verify all chosen discovery endpoints against the supported tagged version and a real instance before release.
- Resolve the upstream ambiguity around analysis availability and no matches. A successful metadata lookup is insufficient. An ambiguous error must fail conservatively; it must not be reported as a valid shortage or proven missing analysis. If upstream cannot provide reliable evidence, satisfying this policy remains an implementation blocker.
- Calibrate and document quality thresholds for each chosen index/model against representative homogeneous and mixed-style lists. Do not assume distances are interchangeable across models or releases. Threshold values remain an empirical prerequisite, not a silently chosen default.
- Bound upstream concurrency, candidate retrieval, and retries within the overall budget. Library size and reference count must not create unbounded work.

## Acceptance criteria

- Existing explicit-list workflows work with AudioMuse absent or unavailable.
- Description search, single-track similarity, and supplied-list expansion return IDs from the intended Navidrome library; cross-server and stale IDs cannot silently become selected additions.
- Missing and ambiguous requested songs block expansion until selected or omitted. Explicit repetitions survive in order and do not inflate the default addition target.
- Mixed-style examples demonstrate roughly equal recommendation opportunity across reference tracks, including slot redistribution after filtering and deduplication.
- Additions meet the calibrated quality floor. Low availability yields an explicit shortage without weaker padding; uncertain alternate versions remain reviewable.
- Missing analysis is never silently ignored. Ambiguous upstream failures, authorization failures, timeouts, and partial failures preserve the current draft and clearly report unsuccessful expansion.
- Regeneration, retention, reference selection, and add-more behave as specified across retries, restarts, draft copies, and concurrent draft edits. Failed regeneration preserves prior additions.
- Previews distinguish supplied songs from additions and correspond to the exact published revision. Existing approval policy, once-only creation, and recovery behavior remain intact.
- Explicit addition limits and total draft capacity are enforced and reported. The 60-second default applies to the entire attempt, including retries.
- Validate adapters against representative HTTP fixtures and the supported real AudioMuse release; no live integration or quality calibration has yet been performed.

## Deferred scope

AudioMuse installation, model lifecycle, triggering library analysis, direct AudioMuse playlist writes, changing existing published playlists, song paths, lyrics search, recording search, and user interfaces are outside this extension. Their inclusion would require a separate scope decision.

Additional discovery ideas and example workflows are saved in [Future AudioMuse-AI integrations](future-integrations.md) for future reference; they do not extend the agreed scope.

## Upstream findings

Read-only inspection of upstream main found that `POST /api/alchemy` accepts multiple ADD songs without creating a playlist. Its implementation ranks candidates by proximity to any supplied anchor, so it does not guarantee balanced coverage across the list. Missing seed vectors may silently contribute no anchor points. These behaviors require explicit handling before Alchemy can satisfy the agreed expansion policy.

Sources: [Alchemy API](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/app_alchemy.py), [Alchemy recommendation implementation](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/tasks/song_alchemy.py).

The selected `server` controls provider ID translation. Results still require validation against the configured Navidrome library. A pinned-release compatibility check and real-instance tests remain necessary; no live deployment has been exercised.

Read-only source inspection of [stable v3.7.1](https://github.com/NeptuneHub/AudioMuse-AI/releases/tag/v3.7.1), commit `ac65c469d288a45092db77cc76c1e347a9e14f48`, confirms `/api/similar_tracks` conflates missing analysis, no candidates, and some internal failures into a 404. `/api/track` checks metadata rather than usable similarity vectors. A successful `/api/max_distance` can provide positive same-index evidence, but its failures remain ambiguous, its computation can scan index cells, and it is separate from the recommendation request. Do not label an ambiguous failure as proven missing analysis or as a valid shortage. A reliable availability contract is an implementation prerequisite for the agreed policy; unresolved responses must conservatively leave expansion unsuccessful.

Stable-version sources: [similarity routes](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/app_ivf.py), [index and vector handling](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/tasks/ivf_manager.py).

## References

- https://github.com/NeptuneHub/AudioMuse-AI
- ../../docs/adr/0003-optional-audiomuse-discovery.md
