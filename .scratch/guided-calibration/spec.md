# Guided calibration in conversation

Status: done

Blocked by: [audiomuse-3.7.4](../audiomuse-3.7.4/spec.md); after
[setup-cli](../setup-cli/spec.md).
Decision record: [ADR 0006](../../docs/adr/0006-calibrate-in-conversation-and-store-locally.md).
Vocabulary: Calibration, Calibration probe, Calibration rating, Quality cutoff, and
Stale calibration in the [glossary](../../GLOSSARY.md).

## Problem Statement

Enabling recommendations requires a Bash/curl/jq procedure, hand-written JSON, and
an absolute `AUDIOMUSE_CALIBRATION_PATH`. It is the main barrier to the optional
feature and does not work natively on Windows.

## Solution

MCP tools let the agent run calibration with the user in conversation and store it
locally. No default quality cutoffs ship.

## User Stories

- As a user, I say "calibrate recommendations" and rate candidates good or poor in
  chat while listening in Navidrome.
- As a user, I see which rated candidates a proposed cutoff accepts and rejects
  before saving it.
- As a user, I can calibrate only similarity first and use similar-song features
  while description search still reports `calibration_required`.
- As a user who changed AudioMuse models or index, I reset a scale and recalibrate.

## Implementation Decisions

- Tools (names to finalize): collect candidates for a probe track or probe
  description; record calibration ratings; propose a cutoff for a scale; save a
  proposed cutoff; reset a scale; plus calibration status in
  `check_audiomuse_connection`.
- Proposal rule: similarity cutoff is the largest good distance below the smallest
  poor distance; description cutoff is the smallest good similarity above the
  largest poor similarity. Requires at least one good and one poor rating across at
  least three probes for that scale; otherwise the agent collects candidates further
  down the list. Proposal and save are separate calls.
- Ratings are trusted agent input, like approval assertions.
- Storage: new tables via a reviewed migration, bound to the persisted identity
  plus AudioMuse URL, selected server, Navidrome URL, and minor release. Ratings
  persist as evidence; recalibration starts fresh ratings and keeps old ones as
  history.
- Staleness: a change in URL, server, Navidrome URL, or minor release makes a scale
  stale; discovery returns `calibration_required` with a stale reason. Reset marks a
  scale stale for undetectable model or index changes.
- Remove `AUDIOMUSE_CALIBRATION_PATH` and file loading. Existing file users save
  their two cutoffs once through the save path (with a recorded note instead of
  ratings).
- After saving, the agent suggests (does not require) testing an unrated probe.
- Docs: rewrite `docs/calibration.md` as concepts and when to recalibrate, with no
  scripts; trim setup steps from `docs/discovery.md`.

## Testing Decisions

- Service-level tests with SQLite and fake AudioMuse fixtures: proposal rule edge
  cases (no poor rating, interleaved good and poor, ties at the boundary, fewer than
  three probes), independent scales, staleness on each bound field, minor vs patch
  release, reset, and migration from the old configuration.

## Out of Scope

- Default cutoffs, automatic model or index fingerprinting, calibration through the
  `setup` CLI, and playing audio from the service.
