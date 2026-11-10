# Playlist update implementation status

Implementation and dedicated live validation were subsequently authorized in the
conversation, superseding the original spec's planning-only authorization.

## Implemented

The existing-target append workflow provides revisioned additions and separate
references, matching and omission, balanced discovery, preview and approval,
conflict refresh, durable per-target coordination, append verification, restart
inspection, and explicit recovery. Creation remains a separate workflow.

The final gap review added:

- Recovery comparisons against both original and intended states, including
  metadata changes, ordered-position changes and per-track occurrence counts.
  Inspection explains that observations cannot establish causation or completion.
  Successful verification and reconciliation persist their observed comparison;
  historical journals without this optional field remain readable.
- Refresh preservation of existing discovery warnings and shortages, alongside
  explicit notices for removed recommendations, including retained tracks.
- Retry target validation after library revalidation, preventing dispatch against
  a baseline changed during that work.
- Application and retry rejection of unresolved reference-only songs.

## Automated evidence

The public service tests use real HTTP fixtures and SQLite. Update coverage now
includes ordered repetitions and metadata, explicit and reference-only discovery,
count boundaries and independent 500-occurrence limits, approval invalidation,
matching preconditions, unavailable additions and targets, target change
categories, recommendation refresh, uncertain and unexpected results, actual
timeouts with delayed execution, recovery assertions and key/version checks,
concurrent instances, persisted comparisons and restart behavior.

The stdio suite covers tool exposure, killed append workers, durable target
blocking and serialized recovery-inspection results. Existing creation,
discovery and database-upgrade suites remain in the full required check.

Entry points:

- [Update service tests](../../tests/integration/updates.test.ts).
- [Discovery service tests](../../tests/integration/discovery.test.ts).
- [Upgrade tests](../../tests/integration/upgrade.test.ts).
- [MCP process tests](../../tests/e2e/mcp.test.ts).

## Live evidence and remaining release validation

[Live validation](live-validation.md) passed for public and private targets on
Navidrome 0.64.2, including exact ordered repetitions, preserved metadata, retries
and cleanup of dedicated playlists.

Cross-account ownership-denial validation remains outstanding because only one
account is configured. Local permission-denial tests verify conservative service
behavior but do not establish the deployed server's cross-account behavior.

No additional live playlist writes were needed for the final implementation gap
closure.
