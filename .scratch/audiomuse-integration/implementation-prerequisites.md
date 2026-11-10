# Implementation prerequisites

Current status: the user confirmed the proposed test seams and supplied a live
AudioMuse endpoint and token configuration. Read-only compatibility checks now
succeed; see [live validation](live-validation.md). User-rated quality boundaries
are now recorded in [the calibration report](calibration.md) and active locally.
The notes below preserve the initial prerequisite assessment.

Implementation was requested on 2026-11-10 using
`/tmp/navidrome-audiomuse-handoff-EJI7N6.md`. The planning-only statements in the
spec and ADR 0003 describe the earlier interview; they do not supersede this
request. Feature scope remains the agreed spec.

## Verified source baseline

The available checkout at `/tmp/audiomuse-contract` resolves to
`ac65c469d288a45092db77cc76c1e347a9e14f48`, the spec's v3.7.1 baseline.
This is source inspection, not a successful real-instance compatibility check.

- Description search: `POST /api/clap/search` accepts `query` and `limit`;
  results include `item_id`, `title`, `author`, and `similarity`. Its server
  selection is read from the query string. Source:
  [app_clap_search.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/app_clap_search.py).
- Similarity: `GET /api/similar_tracks` accepts `item_id`, `n`, and `server`.
  Results include `item_id`, `title`, `author`, and `distance`. Set
  `radius_similarity=false` and `mood_similarity=false` explicitly when
  evaluating direct per-reference sound similarity; inherited server defaults
  otherwise alter search behavior. Source:
  [app_ivf.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/app_ivf.py),
  [ivf_manager.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/tasks/ivf_manager.py).
- A similarity 404 conflates missing analysis, no candidates, and internal
  paths that return no results. It cannot establish a valid shortage or prove
  missing analysis. An attempt encountering it must fail without draft changes.
- `GET /api/max_distance` with `item_id` and `server` provides positive
  same-index evidence on a successful, valid response. Failures remain ambiguous;
  the implementation catches computation exceptions and can return no result.
  This check is separate from the similarity request and cannot establish an
  atomic index snapshot. Source: the same similarity route and index files.
- `GET /api/version` returns `app_version`. `GET /api/models` reports enablement
  and coverage, including selected-server coverage, but its response does not
  identify the index build, model artifact, or metric configuration sufficiently
  to bind empirical thresholds automatically. Sources:
  [app.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/app.py),
  [model_coverage.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.1/tasks/model_coverage.py).

## Required external inputs

No calibration report or representative evaluation dataset was supplied by the
handoff or spec. No real AudioMuse deployment has been exercised for this work.
The spec explicitly forbids assuming a default similarity threshold and requires
calibration against representative homogeneous and mixed-style playlists before
release.

To complete calibration and compatibility validation, provide either an existing
calibration report for the target deployment or access to the deployment and
representative playlists. Identify:

1. The actual target AudioMuse version and the selected media server corresponding
   to this Navidrome library. Supply credential configuration locations rather
   than putting secrets into issue files or chat.
2. The similarity index/model, distance metric, and relevant search settings, plus
   the CLAP model used for description search. Similarity distances and CLAP
   scores require separate evaluation.
3. Representative homogeneous and mixed-style lists, with reviewed examples of
   acceptable and unsuitable additions. Record the examples, measured scores,
   chosen quality floors, and observed shortages in the calibration report.

Source inspection and synthetic HTTP fixtures can establish adapter and policy
behavior, but cannot substitute for this empirical evidence. Runtime feature work
and its release checks remain outstanding; this note does not mark the spec as
implemented or weaken its acceptance criteria.

## Test seams awaiting confirmation

The implementation session proposed testing through public playlist-service tools
with real local HTTP fixtures and SQLite, plus stdio MCP for tool exposure. The
TDD skill requires explicit seam confirmation before writing tests. These tests
would cover revision safety, retention, retries, restarts, and publication behavior;
they would not establish real-model recommendation quality.
