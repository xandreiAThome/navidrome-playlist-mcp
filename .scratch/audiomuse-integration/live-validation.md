# AudioMuse live validation — 2026-11-10

## Deployment and adapter compatibility

Authenticated read-only checks against the supplied deployment succeeded after
its bearer token was configured in the local, ignored `.env` file. No credentials
are included here. The upstream release API and deployment both reported v3.7.1.

The selected AudioMuse server is Espupify, a Navidrome server. Its configured base
URL matches this MCP's `NAVIDROME_URL`. Navidrome authentication also succeeded.
AudioMuse reported 3,215 tracks with 100% local coverage for MusicNN and CLAP.
The setup catalog reports the MusicNN distance metric as `angular`.

The following endpoints returned usable successful responses:

- `GET /api/version`, `GET /api/servers`, `GET /api/models`.
- `GET /api/max_distance` and `GET /api/similar_tracks`, scoped to the selected
  server, for 12 reference tracks across four existing playlists. Similarity
  queries explicitly disabled radius walking, mood filtering, and duplicate
  elimination, and requested at most 200 candidates each.
- `POST /api/clap/search`, with server selection in the query string, for three
  descriptions, requesting at most 200 results each.

These checks performed no playlist writes, analysis, model changes, or index
refreshes. Synthetic fixtures cover failures that were not induced on the live
server. The runtime additionally validates recommendation IDs and recording
metadata against Navidrome before selecting additions.

The built production modules also passed live smoke checks through the public
service tools: description discovery and single-track similarity each returned
three Navidrome-validated recommendations; an in-memory mixed draft expanded by
four additions attributed to two distinct references. Those adapter smoke checks
used explicitly permissive test-only bounds, never saved or activated as quality
calibration. No remote playlist was created. Subsequent user ratings established the deployment-specific quality floors in
[the calibration report](calibration.md), and normal local configuration now reports
`calibrated: true`.

## Calibration observations

Three reference tracks were sampled from each playlist. Counts below include
returned neighbors already in the same playlist, excluding the reference itself.
Membership supplies positive examples; absence from a playlist does **not** prove
that a recommendation is unsuitable.

| Playlist                          | Known positive pairs returned | Observed distance range |
| --------------------------------- | ----------------------------: | ----------------------- |
| City Pop                          |                             9 | 0.1360–0.4016           |
| Rock Ballad                       |                            13 | 0.0389–0.2524           |
| Calm Jazz Instrumentals_automatic |                           155 | 0.0108–0.2443           |
| Espupi’s                          |                           115 | 0.0282–0.2259           |

The automatically generated instrumental playlist is a weaker quality reference
than a user-curated list. The broad Espupi’s list provides mixed-list observations,
but the sample is small and its membership does not establish a shared sound.
Balanced coverage is therefore checked separately through fixture-based examples.

The user accepted all six similarity examples below:

| Reference                      | Recommendation                              | Distance |
| ------------------------------ | ------------------------------------------- | -------: |
| Plastic Love — Mariya Takeuchi | Caribbean Night — 松原みき • Yoichi Umemoto |   0.0693 |
| Plastic Love — Mariya Takeuchi | Wash — 松原みき • Kang Jin Hwa              |   0.0837 |
| Freesia — 石渡太輔             | Lily — 石渡太輔                             |   0.0670 |
| Freesia — 石渡太輔             | Icarus — 石渡太輔                           |   0.0968 |
| Antukin — Rico Blanco          | This Feeling — TONEEJAY                     |   0.0301 |
| Antukin — Rico Blanco          | ride — wave to earth                        |   0.0309 |

Description scores require separate calibration:

| Description            | Same-playlist examples among 200 results | Observed positive similarities            |
| ---------------------- | ---------------------------------------: | ----------------------------------------- |
| city pop               |                                        0 | No positive calibration examples returned |
| rock ballads           |                                        2 | 0.5291–0.5412                             |
| calm instrumental jazz |                                       23 | 0.2737–0.4908                             |

Playlist-membership observations alone did not establish the quality floors. The
user subsequently accepted the six similarity examples and identified the two
city-pop description results as poor fits. The resulting separate MusicNN and CLAP
boundaries, validation outcomes, and limits are recorded in
[the calibration report](calibration.md).

## Final validation state

Deployment-bound calibration is active in the ignored local configuration.
Calibrated description search returned an explicit city-pop shortage and retained
the accepted rock-ballad and instrumental examples. A mixed expansion produced
eight additions across all four reference tracks, without relaxing the floor.
All live checks used in-memory drafts; no remote playlist writes occurred.

Formatting, lint, typecheck, build, and all 35 tests passed. Standards review found
no actionable issues. Spec review fixes covered reference eligibility after
releasing recommendations, explicit conversion of a recommendation to a supplied
song, and a shared connectivity deadline. The initial calibration prerequisite is
now addressed by user-rated measurements; the small sample and model/index
invalidation limits remain documented in the calibration report.
