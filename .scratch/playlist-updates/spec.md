# Append explicit songs and similar-song recommendations to existing playlists

Status: ready-for-agent

The design interview is complete, and the user confirmed the testing seams.
This spec authorizes planning; implementation and live playlist writes have not
been requested.

## Problem Statement

Users can create playlists from explicit song lists and AudioMuse recommendations,
but cannot use the same local agent workflow to add tracks to an existing
Navidrome playlist. They need to say either “add this song list to this playlist”
or “add songs similar to this list to this playlist” without rebuilding the
playlist, changing its visibility, or accidentally adding the reference songs.

Existing playlists may contain repeated tracks, share names, change in another
client, or receive a write whose response is lost. Users need an exact preview,
clear conflict reports, and deliberate recovery rather than silent duplicate
appends, replacement of existing contents, or misleading success reports.

## Solution

Introduce an update draft bound to one existing playlist ID. Keep its original
playlist state, proposed additions, and reference tracks separate. Resolve
explicit requested songs using established matching rules, or select additional
recommended tracks guided only by the supplied reference list. Reference tracks
are appended only when separately requested.

Let the user edit proposed additions, inspect the exact draft revision, and apply
an append that preserves existing tracks, order, name, and visibility. Recheck
the target before application, verify the complete result afterward, and journal
the operation across retries and restarts. Detected changes require refreshing
the preview. Uncertain or unexpected writes block further updates to that target
until explicit reconciliation. Conflict detection is best effort because remote
clients can still edit between the final read and write.

## User Stories

1. As a playlist owner, I want to append an explicit song list to an existing playlist, so that I can extend it without creating a replacement.
2. As a playlist owner, I want to append songs similar to a supplied list, so that I can discover fitting music in a playlist I already use.
3. As a playlist owner, I want supplied reference songs kept out of additions unless separately requested, so that examples do not become unintended playlist contents.
4. As a playlist owner, I want only my supplied reference list to guide similarity, so that the existing playlist does not silently change the recommendation direction.
5. As a playlist owner, I want same-name playlists disambiguated, so that additions reach the intended playlist ID.
6. As a playlist owner, I want a deleted or inaccessible target to stop the update, so that the service does not create a replacement or choose another playlist.
7. As a playlist owner, I want existing track occurrences and their order preserved, so that extending a playlist does not alter its earlier listening sequence.
8. As a playlist owner, I want the target's name and visibility preserved, so that appending music does not rename or expose my playlist.
9. As a playlist owner, I want explicit requested-song occurrences preserved in order, so that intentional repetitions remain meaningful.
10. As a playlist owner, I want explicit additions preserved even when already present in the target, so that the service follows my supplied list consistently.
11. As a playlist owner, I want repetition warnings in the preview, so that I can remove accidental repetitions before applying.
12. As a playlist owner, I want ambiguous requested songs resolved explicitly, so that another recording is not selected silently.
13. As a playlist owner, I want missing requested songs revised or explicitly omitted, so that unavailable songs are not silently discarded.
14. As a playlist owner, I want reference-only songs matched with the same care, so that recommendations reflect the intended recordings.
15. As a playlist owner, I want discovery to require at least one resolved reference, so that an empty reference set cannot produce unrelated additions.
16. As a playlist owner, I want recommendations to exclude target tracks, reference tracks, and already selected additions, so that discovery supplies additional music without repeated track IDs.
17. As a playlist owner, I want established alternate-recording filters and uncertainty warnings retained, so that recommendation behavior remains consistent.
18. As a playlist owner, I want recommendation counts to describe new additions, so that existing contents and reference-only songs do not consume my requested count.
19. As a playlist owner, I want the default recommendation target based on distinct references and capped at 20, so that repeated examples do not inflate the result.
20. As a playlist owner, I want quality-limited shortages explained, so that the service does not pad the result with weaker recommendations.
21. As a playlist owner, I want established balanced discovery, retention, regeneration, and add-more behavior retained, so that update discovery behaves like the existing expansion workflow.
22. As a playlist owner, I want failed discovery to preserve my draft, so that I do not lose resolved additions or prior recommendations.
23. As a playlist owner, I want to remove or reorder proposed additions, so that I can control the appended listening sequence.
24. As a playlist owner, I want to revise matches and reference choices before application, so that I can refine the update without changing Navidrome.
25. As a playlist owner, I want every edit represented by a new draft revision, so that a prior preview or approval cannot authorize changed contents.
26. As a playlist owner, I want previewed target identity, visibility, counts, and ordered additions, so that I can understand the exact destination and effect.
27. As a playlist owner, I want omissions, reference-only songs, warnings, and shortfalls distinguished in the preview, so that I can see what will and will not be appended.
28. As a playlist owner, I want the full resulting order available for inspection, so that I can review the whole playlist when needed.
29. As a playlist owner, I want application tied to the exact preview revision and existing confirmation policy, so that configured approval protects the reviewed update.
30. As a playlist owner, I want unavailable additions caught before writing, so that the service does not silently append a reduced or substituted list.
31. As a playlist owner, I want changes to target contents, name, or visibility detected before application, so that I can reconsider a stale proposal.
32. As a playlist owner, I want refresh to preserve explicit occurrences and report recommendations removed by new exclusions, so that conflict resolution does not silently reinterpret my request.
33. As a playlist owner, I want a retained recommendation removed with an explanation if it is now in the target, so that retention does not bypass recommendation exclusions.
34. As a playlist owner, I want refresh to require a new preview without silently generating replacements, so that I can review the changed proposal.
35. As a playlist owner, I want exact post-write verification, so that incorrect order, repetitions, or metadata do not receive a success report.
36. As a playlist owner, I want repeated application of a successful update draft to return its recorded result, so that transport retries do not append again.
37. As a playlist owner, I want a fresh update draft for an intentional further append, so that a new action is distinguishable from retrying an old one.
38. As a playlist owner, I want drafts and operation history to survive restart, so that service interruptions do not erase pending work or recovery evidence.
39. As a playlist owner, I want only one active local write or recovery per target, so that competing drafts cannot apply using the same stale state.
40. As a playlist owner, I want to prepare multiple drafts while writes are serialized, so that editing does not unnecessarily block other planning.
41. As a playlist owner, I want uncertain writes to block every local update draft for that target, so that another draft or request key cannot bypass recovery.
42. As a playlist owner, I want the dispatched revision locked while its outcome is uncertain, so that recovery inspects exactly what may have been sent.
43. As a playlist owner, I want recovery to inspect original, intended, and current playlist states, so that I can understand evidence without treating it as proof of causation.
44. As a playlist owner, I want to accept a verified intended result explicitly, so that an uncertain operation can be reconciled without another append.
45. As a playlist owner, I want another attempt to require an assertion that the previous request did not apply and cannot still execute, so that retries are deliberate.
46. As a playlist owner, I want every recovery that releases a target to require an assertion that the previous request cannot still execute, so that a matching snapshot does not conceal a pending append.
47. As a playlist owner, I want to accept an unexpected current state explicitly and retain its differences without marking the update successful, so that recovery can end honestly without automatic repair.
48. As a playlist owner, I want partial results left available for inspection without automatic rollback, so that recovery does not overwrite intervening edits.
49. As a playlist owner, I want corrective additions to require a fresh draft and preview, so that reconciliation does not authorize unreviewed changes.
50. As a playlist owner, I want an empty addition set to return no changes without a write, so that omitted or exhausted requests leave Navidrome untouched.
51. As a playlist owner, I want the 500-entry addition limit independent of existing target size, so that an already large playlist remains eligible for updates.
52. As a playlist owner, I want bounded reference-only input and recommendation request sizes, so that discovery remains manageable and limit reports are explicit.
53. As a playlist owner, I want explicit updates usable without AudioMuse, so that optional discovery does not become a dependency for adding a known song list.
54. As a playlist owner, I want the existing create-and-publish workflow preserved, so that adding updates does not weaken creation or recovery guarantees.
55. As a local agent user, I want structured tool results and recovery details without credentials, so that my agent can explain outcomes safely and accurately.

## Implementation Decisions

- Extend the playlist service with a distinct update workflow. Publishing remains creation under the existing creation ADR; append-only updates lift the original deferral of modifications solely within the agreed scope. Preserve existing creation defaults, once-only publication, journaling, and recovery behavior.
- Expose update-draft creation/read/edit, reference configuration and discovery, preview, refresh, apply, operation inspection, and explicit reconciliation through the public tool interface and MCP transport. Exact tool names and shared-versus-separate handlers are implementation choices. Tool schemas and descriptions must distinguish local changes, remote writes, shortages, conflicts, and recovery requirements.
- Bind each update draft to one known playlist ID within the configured Navidrome account and server. Resolve name ambiguity before preparing changes. Never identify the target by name alone or recreate a missing target. Permission denial or loss of access stops the workflow; reading a playlist does not establish permission to edit it.
- Keep the target snapshot separate from proposed additions and editable reference-only requested songs. Snapshot the complete ordered track IDs with repetitions, name, and known visibility. Preserve private visibility explicitly instead of inheriting the public default for new playlist drafts. The snapshot's contents do not consume addition capacity.
- Persist update drafts, immutable revisions, reference choices, recommendation provenance, previews, operation outcomes, and recovery history across restarts. Extend storage through reviewed versioned migrations that preserve existing databases, drafts, and publication journals. Use the existing storage boundary and transactional coordination rather than process-local locks alone.
- Draft edits use expected revisions. Changes to proposed additions, references, or the target snapshot invalidate the previous preview and produce a new revision. Bind optional approval assertions to the exact revision; confirmation is not required by default. A target snapshot cannot be rewritten to hide a dispatched operation's original intent.
- Apply established matching rules to explicit additions and reference-only songs. Preserve requested-song occurrences, including repeated track IDs both within the supplied list and already in the target. Resolve ambiguity explicitly and require revision or explicit omission for missing songs. Incomplete searches must retain their existing conservative meaning rather than establish absence or uniqueness.
- Extend discovery so reference tracks need not be selected destination contents. For similar-song requests, only the supplied reference list guides discovery; do not silently use current playlist contents as references. Separately requesting a reference song as an explicit addition remains valid. Retaining a recommendation alone does not make it a reference.
- Recommended additions exclude track IDs in the target snapshot, supplied reference set, and other selected additions. Keep established balanced allocation, calibrated quality floors, alternate-recording policy and explicit overrides, uncertainty warnings, bounded work, and failure semantics. Do not reopen unrelated AudioMuse policies.
- Recommendation counts describe new recommendations: by default one per distinct resolved reference, capped at 20; explicit counts remain 1–100 per request. Existing regeneration targets the replacement batch while protecting retained recommendations, and add-more targets another batch. Report quality or capacity shortfalls instead of weakening filters. Preserve idempotent expansion requests and source-revision checks.
- Enforce at most 500 proposed addition entries, including repeated and omitted occurrences, independently of existing target contents. Enforce a separate 500-occurrence reference-only input limit. Explicit reference repetitions do not inflate the distinct reference set or default recommendation count. Discovery requires at least one resolved reference.
- Retain existing AudioMuse optionality: explicit additions work without it. Discovery failures, ambiguous analysis failures, and time-budget exhaustion preserve the source draft without partial recommendations. Deliberate retries remain possible. Recommendation regeneration never mutates an uncertain or closed update draft.
- Allow removing, reordering, rematching, retaining, and regenerating proposed additions before application. These edits do not remove or reorder target contents. Refresh after a detected conflict rereads the target, preserves explicit requested-song occurrences, reruns recommendation exclusions, and reports removed recommendations, including retained recommendations newly present in the target. It does not generate replacements automatically and requires a new preview.
- Preview the exact revision with target ID, name and visibility; existing and resulting counts; ordered additions; repetition warnings; omissions; recommendation shortfalls; and clearly separated reference-only songs. Make the full resulting order available for inspection. Preserve the distinction between candidate matches and recommended tracks.
- Immediately before dispatch, check that the revision remains current and previewed, require approval when configured, revalidate every addition, establish known target visibility, and compare the remote ordered track IDs, name, and visibility with the snapshot. Unavailable additions require revision or explicit omission. Detected changes, deletion, or access errors prevent dispatch. Empty resolved additions return a clear no-changes result without a remote write.
- Append using the known target ID and only ordered addition parameters, leaving name, visibility, comment, removal, and other metadata parameters unset. Preserve repeated additions. Do not fall back to replacing the playlist contents if the deployed append behavior cannot satisfy this contract. Validate supported server behavior rather than assuming endpoint availability proves ordering and repetition semantics.
- Persist intent and acquire durable per-target coordination before the request may reach Navidrome. Serialize active writes and recovery across processes sharing this service's database and deployment identity. Editable drafts can coexist; waiting drafts must recheck their snapshots after obtaining coordination. Another draft or operation key cannot bypass an unresolved target block. Coordination does not cover independent databases or remote clients.
- Once a write may have reached Navidrome, lock the dispatched revision. Retain the original snapshot, intended result, target identity, operation identity, and phase sufficiently to recover conservatively across crashes. Repeating application after success returns its recorded result without another append; another intentional append requires a fresh update draft.
- Verify exact resulting ordered track IDs, including all original and added repetitions, and unchanged name and visibility. Only a verified intended result is successful. A post-dispatch mismatch blocks the target for recovery. A lost response, post-dispatch read failure, or worker crash cannot be treated as proof of nonapplication or trigger a blind append retry.
- Recovery inspects the known target and reports its relationship to the original snapshot and intended result, including unexpected or partial differences. These observations do not prove which actor wrote the playlist or that a delayed request cannot execute. Lease expiry permits conservative recovery handling; it does not itself authorize another append or release the target.
- Require an explicit assertion that the prior request cannot still execute for every recovery path releasing a target, including acceptance of a matching intended result. Assertions remain trusted agent input rather than independently authenticated proof. Preserve recovery decisions and protect them against stale or repeated requests using the existing journal and recovery coordination patterns.
- Offer three explicit recovery outcomes: accept a verified intended result; authorize another attempt after asserting nonapplication and no pending execution and checking the target afresh; or accept an unexpected current state while recording differences and closing as reconciled without claiming success. Unexpected or partial outcomes remain blocked until an explicit valid decision. If a fresh target check detects a changed baseline, require refresh and preview rather than silently rebasing a retry.
- Never repair, roll back, delete, replace contents, or append missing tracks automatically during recovery. Corrective additions after a closed reconciliation require a fresh update draft and preview. Successful or reconciled operations remain closed. A failure established to have applied nothing with no request pending may leave the draft editable; uncertainty may not.
- Continue keeping Navidrome and AudioMuse credentials in process configuration, excluding them from schemas, tool results, operation details, logs, and upstream error text. Retain existing configuration/deployment identity protections.

## Testing Decisions

- The user confirmed the existing public service tool interface as the primary behavior seam, backed by real local Navidrome and AudioMuse HTTP fixtures and SQLite. Extend existing stdio MCP tests for transport contracts, cross-process coordination, restart, and killed-worker recovery. Do not add internal test seams merely to test individual helpers.
- Test externally observable results, exact remote ordered contents, write counts and parameters, preserved metadata, revision behavior, durable recovery, and the absence of forbidden writes. Do not mirror private control flow or require a particular internal class, table decomposition, or helper implementation.
- Exercise the playlist service, matching and discovery integration, Navidrome adapter, persisted coordination and migrations, and MCP exposure through these public seams. Prior art is the repository's service and discovery integration suites, HTTP fixtures, database-upgrade tests, and stdio lifecycle tests.
- Cover both end-to-end user requests: append an explicit list, and append recommendations from a reference-only list. Verify reference-only tracks stay absent, the existing playlist supplies no implicit references, and an explicitly requested reference track can separately be appended. Test with discovery absent for explicit additions.
- Test ambiguous and missing targets and songs, permission denial, unknown visibility, deleted or unavailable additions, incomplete matching, all-omitted input, no references, and no eligible recommendations. Assert actionable structured outcomes and no remote writes when preconditions fail.
- Assert explicit occurrences and order with a target containing A, B and additions A, C, C: the expected result is A, B, A, C, C. Separately assert recommendation exclusion of target IDs, reference IDs, and selected additions; retained status must not override refreshed target exclusions.
- Cover balanced discovery, distinct-reference defaults, explicit counts, quality and capacity shortfalls, alternate-recording behavior, optional AudioMuse, and atomic preservation on discovery failures. Reuse existing discovery prior art and quality policy instead of introducing a new scoring contract.
- Verify revision changes invalidate preview and configured approval, and that stale edits or asynchronous expansion cannot overwrite a newer revision. Check complete preview fields, separate references and omissions, and access to full resulting order.
- Cover target track additions, removals, reorderings, repetition changes, renaming, and visibility changes between snapshot and application. Assert rejection before dispatch, explicit refresh, preserved explicit occurrences, filtered recommendations, reported removals, and a required new preview without automatic refill.
- Model an external edit between the final check and append. Verify that no content replacement or metadata write occurs and that unexpected final state leads to blocked reconciliation rather than a false atomicity guarantee or automatic repair.
- Verify private and public targets retain their visibility, name, and preexisting ordered contents. Have the fixture reject any update metadata or removal parameters and any replacement fallback. Model a server that drops repetitions or changes order; assert verification failure and a blocked target rather than success.
- Test exact limits: 500 addition entries independent of a target already over 500 tracks, separate 500-occurrence reference-only input, counts of 1 and 100, invalid counts outside that range, and default deduplication of repeated references. Assert explicit capacity reports and no silent truncation of requested songs.
- Use multiple application instances and stdio processes against the same database to prove per-target serialization, waiting-draft rechecks, and blocking across distinct drafts and request keys. Allow concurrent editing. Preserve existing new-playlist publication tests.
- Simulate timeouts before and after server-side application, delayed execution, lost responses, verification-read failures, and process termination around dispatch. Restart with the same database and assert immutable intent, retained target blocks, and no automatic second append. An unchanged or intended-looking target alone must not release an uncertain operation.
- Test all recovery choices and assertions, stale recovery attempts, repeated recovery requests, changed baselines before authorized retries, and acceptance of unexpected current contents. Verify recorded differences, no false success for unexpected results, target release only under the agreed conditions, and no rollback or repair requests.
- Test repeated application after verified success and after reconciled closure, and new drafts for intentional later appends. Confirm a definitely nonapplied, nonpending failure can remain editable while uncertain drafts remain locked.
- Extend database-upgrade coverage to preserve existing drafts, revisions, creation operations, recovery history, and deployment binding. Retain credential-redaction and invalid-input coverage through the public tool and stdio seams.
- Validate the supported deployed Navidrome version's append contract for ordering, repeated IDs, metadata preservation, empty additions handled locally, and ownership restrictions before release. Local fixtures make automated tests deterministic; they do not prove deployed server behavior. This spec grants no permission for live writes; any necessary live write validation requires separate authorization.
- For implementation, run the repository's required formatting, lint, typecheck, build, and test checks. This documentation-only specification does not require executing the implementation test suite now.

## Out of Scope

- Removing or reordering tracks already in the target, changing playlist metadata or visibility, deleting playlists, or replacing entire contents.
- Automatically creating a replacement for an unavailable target or silently choosing among same-name playlists.
- Automatically adding reference-only songs, mixing current playlist contents into the reference set, or applying deduplication rules to explicit requested-song occurrences.
- Atomic conflict prevention against other Navidrome clients, remote conditional-write guarantees, exactly-once delivery guarantees, or coordination between independently configured databases.
- Blind append retries, automatic rollback or partial-result repair, and inferring request completion solely from playlist contents.
- Changes to existing creation/publication guarantees, unrelated AudioMuse discovery policies, AudioMuse installation or analysis management, new transports, browser UI, and multi-user access.
- Implementation tickets, code implementation, live remote writes, and deployment as part of this specification task.

## Further Notes

- The authoritative design decision is [ADR 0004](../../docs/adr/0004-append-to-existing-playlists.md). Use the root [glossary](../../GLOSSARY.md) for domain vocabulary. Creation-specific glossary terms and recovery meanings continue to apply to publishing; update results must clearly identify their own operation kind.
- Preserve the architecture and creation guarantees in [ADR 0001](../../docs/adr/0001-external-agents-drive-a-local-playlist-service.md) and [ADR 0002](../../docs/adr/0002-journal-publication-and-stop-on-unknown-creation.md), with the append-only scope extension recorded in ADR 0004.
- Discovery policies come from [ADR 0003](../../docs/adr/0003-optional-audiomuse-discovery.md) and the [AudioMuse spec](../audiomuse-integration/spec.md). Historical implementation-authorization and validation statements there describe earlier planning; consult the existing [calibration](../audiomuse-integration/calibration.md) and [live validation](../audiomuse-integration/live-validation.md) records when assessing current discovery behavior.
- The inspected [OpenSubsonic updatePlaylist contract](https://opensubsonic.netlify.app/docs/endpoints/updateplaylist/) documents playlist ID, repeated song additions, optional metadata/removals, and owner-only updates, with no conditional-write parameter. It does not establish the deployed Navidrome version's precise behavior; adapter compatibility remains a release validation requirement.
- A target snapshot containing the intended result is evidence of current state, not proof that this operation caused it or that a pending request has finished. Recovery assertions explicitly preserve this distinction.
- The user confirmed service-level public tool tests with real local HTTP fixtures and SQLite, supplemented by stdio MCP lifecycle and concurrency tests. No additional test-seam decision is pending.
