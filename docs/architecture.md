# Architecture

This document records system boundaries and constraints that features must
preserve. Decision rationale lives in [ADRs](adr/), domain meanings in the
[glossary](../GLOSSARY.md), and source navigation in the
[project map](project-map.md). Runtime versions, dependencies, and build settings
remain authoritative in [package.json](../package.json) and the configuration
files linked from the project map.

## Deployment and trust boundary

The service runs locally for one configured Navidrome account. External agents
interpret conversation and invoke structured tools over MCP stdio. The service
owns library interpretation, draft consistency, and remote write policy.
Credentials belong to process configuration, outside the tool contract.

Multiple client processes may share the same local database. Container packaging
retains this process-and-storage boundary; it does not introduce a network
service. Setup and operational instructions belong in the [README](../README.md).
The reasons for this boundary are in
[ADR 0001](adr/0001-external-agents-drive-a-local-playlist-service.md).

## Responsibilities and dependency direction

| Boundary                  | Responsibility                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Agent transport           | Expose validated tool contracts and translate calls and results.                                    |
| Application workflows     | Interpret requests, manage drafts, and enforce discovery, write, verification, and recovery policy. |
| External-service adapters | Authenticate requests, bound network work, and validate upstream responses and identities.          |
| Local storage             | Preserve intent and history, enforce revision consistency, and coordinate competing workers.        |
| Composition root          | Assemble dependencies and manage resource lifecycle.                                                |

The transport invokes application workflows. Workflows use external-service and
storage interfaces; those interfaces encapsulate HTTP and database mechanics.
Transport changes must not become a second owner of workflow policy, and
adapters must not decide whether a user request authorizes a write.

Matching interprets evidence about requested recordings. Discovery proposes
library tracks through the same draft and review boundary; it does not own remote
playlist writes. Optional discovery infrastructure remains separately managed,
as established in
[ADR 0003](adr/0003-optional-audiomuse-discovery.md).

## State ownership and review

Navidrome owns the live library and remote playlists. Local storage owns proposed
intent, immutable draft revisions, review records, operation history, and recovery
decisions. Local snapshots describe intent or observed remote state; they do not
establish exclusive ownership of remote state.

Edits use revision checks so stale work cannot overwrite newer intent. Preview
and approval refer to an exact revision. The service trusts the external agent's
approval assertion when confirmation is configured; it is not an independently
authenticated human approval channel.

Persisted state is bound to one configured server and account. Upstream track
identities and discovery results must refer to that same library. Optional
discovery failure must leave explicit-list workflows available and preserve
previously committed draft intent.

## Remote writes and recovery

Local transactions coordinate workers sharing the database. They cannot include
remote HTTP effects or serialize independent Navidrome clients. Remote requests
can execute even when their response is lost, so a transport failure is not proof
that a write did not happen.

Write workflows persist their intent and operation identity before remote
dispatch, retain a known remote playlist identity, and verify the intended result
before claiming success. Retry and recovery policy belongs to the operation
owner, with durable coordination across workers. Uncertainty must remain visible
rather than becoming an automatic second write.

Operation-specific contracts are recorded in
[ADR 0002](adr/0002-journal-publication-and-stop-on-unknown-creation.md) and
[ADR 0004](adr/0004-append-to-existing-playlists.md).
These include the distinction between creating a playlist and modifying a known
target. Names alone cannot establish remote identity; recovery assertions are
trusted input, not proof of causation or request completion.

## Persistence evolution

SQLite provides durable local state and transactional coordination. Schema
upgrades preserve existing intent and operation history and serialize version
checks with schema changes. An incompatible or failed upgrade stops startup
rather than serving against partially upgraded state.

Storage representation and migration mechanics belong in
[coding standards](coding-standards.md). Changes to system ownership, dependency
direction, deployment boundaries, or guarantees require revisiting this
architecture and the relevant ADRs; adding a feature within those boundaries
does not require a capability inventory here.
