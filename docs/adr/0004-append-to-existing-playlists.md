# Append to existing playlists through a distinct update workflow

The agreed existing-playlist extension lifts ADR 0001's deferral of modifications
for appending tracks, while preserving the target's existing tracks, order, name,
and visibility. Publishing continues to mean creating a new playlist under ADR
0002; the update workflow has the conflict and recovery policies recorded below.
This limits the initial write surface to the two requested addition scenarios
without introducing removal, reordering, or metadata editing.

Explicit song lists preserve every requested occurrence, including tracks already
in the target, with repetitions flagged in the preview. Similar-song additions
use only the supplied list as references; those reference tracks are added only
when separately requested. Updates follow the existing confirmation policy:
application requires an exact preview revision, with an approval assertion when
confirmation is configured and no separate human confirmation required by default.

An update binds to a single playlist ID. Ambiguous names must be resolved before
preparing changes; deletion or loss of access stops the update without creating
a replacement. Recommendation additions exclude target track IDs, supplied
reference IDs, and IDs already selected for addition, retaining the established
alternate-recording filters. Recommendation counts refer to new recommendations;
the default is one per distinct reference track, capped at 20. A quality-limited
shortfall is reported rather than filled with unsuitable tracks.

Immediately before application, reread the target and reject detected changes to
its ordered track IDs, name, or visibility. Refreshing requires a new preview.
This is best-effort conflict detection: the documented API has no conditional-write
parameter, so another client can still write between the check and append.

Persist update operations. A timeout or crash after dispatch blocks further
updates to the same target through this service, including other drafts, until
reconciliation. Inspecting the known target provides evidence, but an unchanged
snapshot alone does not establish that a delayed request cannot still execute.
Never retry an uncertain append blindly; unresolved outcomes require explicit
recovery.

An update draft keeps its target snapshot, proposed additions, and editable
references separate. Successful application is recorded once: repeated apply
requests return the recorded result, while an intentional further append requires
a new update draft. Refreshing after a conflict preserves explicit requested-song
occurrences and reruns recommendation exclusions against the latest target.
Recommendations newly present in the target are removed from additions with an
explanation, including retained recommendations; refresh does not silently
generate replacements and always requires a new preview.

Recovery can explicitly accept a verified intended result, or authorize another
attempt after asserting the previous request neither applied nor can still
execute and checking the target afresh. Such assertions are trusted agent input,
as in creation recovery. Unexpected or partial results remain blocked until
explicit reconciliation; no automatic rollback or repair is performed.

Reference-only requested songs follow existing matching rules: ambiguity requires
explicit resolution, and missing songs require revision or explicit omission.
Discovery requires at least one resolved reference. Proposed additions have the
existing 500-entry limit independently of target contents; reference-only input
has a separate 500-occurrence limit. Recommendation request counts retain their
1–100 limit. Empty additions return a no-changes result without a remote write.

Application sends only proposed additions to the known playlist ID, leaving
metadata parameters unset. If deployed append behavior cannot preserve order and
repetitions, stop rather than replace the target's entire contents. Revalidate
every addition before writing; unavailable tracks require revision or explicit
omission, and target visibility must be known. Success requires verification of
the exact expected ordered track IDs, including repetitions, and unchanged name
and visibility. A mismatch after dispatch blocks further updates for recovery.

The service serializes active writes and recovery per target, while allowing
multiple editable update drafts. A waiting draft rechecks its snapshot before
application. Proposed additions may be removed, reordered, rematched, or have
recommendations regenerated before application; each edit produces a new revision
without editing the target's existing contents.

Previews show target ID, name, visibility, existing and resulting counts, ordered
additions, repetition warnings, omissions, recommendation shortfalls, and clearly
separated reference-only songs. Full resulting order is available for inspection.

Every recovery path that releases a target requires an assertion that the previous
request can no longer execute, even when current contents match the intended
result. Recovery may also explicitly accept an unexpected current state, recording
its differences and closing the operation as reconciled without marking it
successful. Corrective additions require a fresh update draft and preview.

Once a write may have reached Navidrome, lock the update draft to the dispatched
revision. Recovery uses that immutable revision; successful or reconciled
operations remain closed. A failure established to have applied nothing, with no
request still pending, may leave the draft editable. Further intentional changes
after a closed operation require a new update draft.

These are design decisions; implementation is not yet authorized.
