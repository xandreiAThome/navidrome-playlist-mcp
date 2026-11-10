# Deployment quality calibration — 2026-11-10

## Scope and method

This calibration applies to the supplied AudioMuse deployment running v3.7.1,
selected Navidrome server Espupify, and the deployed MusicNN/angular and CLAP
indexes containing 3,215 tracks. It is not a default for other installations.

The [live validation](live-validation.md) sampled 12 references across City Pop,
Rock Ballad, Calm Jazz Instrumentals_automatic, and the mixed Espupi’s playlist,
plus three descriptions. Playlist membership supplied context, not negative
quality labels. The user assessed concrete recommendations in this session:

- All six similarity examples below were accepted as fitting recommendations.
- Of the six description examples, the user identified the city-pop pair as poor
  fits. The other two description groups were treated as acceptable.

For a conservative initial boundary, take the **largest accepted MusicNN distance**
and the **smallest accepted CLAP similarity**, including equality. Do not extend
beyond these observed accepted bounds to meet requested counts. The description
boundary also excludes both explicitly rejected examples. No claim is made that a
scalar score can classify every listening description or future recommendation.

## Rated similarity examples

| Reference                      | Recommendation                              |            Distance | Assessment |
| ------------------------------ | ------------------------------------------- | ------------------: | ---------- |
| Plastic Love — Mariya Takeuchi | Caribbean Night — 松原みき • Yoichi Umemoto | 0.06931066513061523 | Acceptable |
| Plastic Love — Mariya Takeuchi | Wash — 松原みき • Kang Jin Hwa              |  0.0836871862411499 | Acceptable |
| Freesia — 石渡太輔             | Lily — 石渡太輔                             | 0.06702613830566406 | Acceptable |
| Freesia — 石渡太輔             | Icarus — 石渡太輔                           | 0.09677529335021973 | Acceptable |
| Antukin — Rico Blanco          | This Feeling — TONEEJAY                     | 0.03010505437850952 | Acceptable |
| Antukin — Rico Blanco          | ride — wave to earth                        | 0.03086763620376587 | Acceptable |

**Maximum MusicNN angular distance: `0.09677529335021973`.**
This is the observed Freesia → Icarus boundary, without rounding upward.

## Rated description examples

| Description            | Recommendation                      |    CLAP similarity | Assessment |
| ---------------------- | ----------------------------------- | -----------------: | ---------- |
| city pop               | Imaginary Love — milet              | 0.5130307674407959 | Poor fit   |
| city pop               | Precious wing (full version) — 茶太 | 0.5123594403266907 | Poor fit   |
| rock ballads           | You’re My Best Friend — Queen       | 0.5468575954437256 | Acceptable |
| rock ballads           | All I Can Do — 石渡太輔             | 0.5412379503250122 | Acceptable |
| calm instrumental jazz | The Third Night — Yorushika         | 0.5585587024688721 | Acceptable |
| calm instrumental jazz | Hotel — Toby Fox                    | 0.5555313229560852 | Acceptable |

**Minimum CLAP similarity: `0.5412379503250122`.**
This retains the weakest accepted description example, All I Can Do, while
excluding the rejected city-pop pair.

## Validation with the calibrated production modules

Normal deployment configuration now loads `.data/audiomuse-calibration.json` via
`AUDIOMUSE_CALIBRATION_PATH` in the ignored `.env`. The JSON binds both server URLs,
selected media server, release, index/model context, this report, and both floors.
It contains no credentials. Raw measurements and ratings are preserved locally in
`.data/audiomuse-calibration-measurements.json`; calibrated test outcomes are in
`.data/audiomuse-calibrated-validation.json`.

Read-only checks through the built production service tools returned:

| Request                                     | Target | Actual | Shortfall |
| ------------------------------------------- | -----: | -----: | --------: |
| Description: city pop                       |      5 |      0 |         5 |
| Description: rock ballads                   |      5 |      2 |         3 |
| Description: calm instrumental jazz         |      5 |      2 |         3 |
| Similar to Plastic Love                     |      5 |      2 |         3 |
| Similar to Freesia                          |      5 |      5 |         0 |
| Similar to Rain Man                         |      5 |      4 |         1 |
| Similar to Antukin                          |      5 |      5 |         0 |
| Mixed expansion using those four references |      8 |      8 |         0 |

The mixed expansion drew additions from all four references. All additions passed
the distance floor; description results passed their separate similarity floor.
The weak city-pop query produced a shortage rather than weaker padding. These
checks used in-memory drafts and did not create remote playlists or change
AudioMuse analysis or indexes.

## Limits and invalidation

This is a small, user-rated initial calibration, not a held-out statistical
quality study. It favors shortages over extending beyond accepted examples, and
previews remain necessary. Further ratings can improve the boundary without
silently weakening it. In particular, MusicNN has positive fit labels here but no
explicit rejected distance examples; CLAP has only two negative labels.

The application checks deployment URLs, selected server, and release. Its version
and coverage endpoints do not identify a model artifact or index-build hash.
Operators must invalidate this calibration and repeat evaluation after changing
models, index settings, metric, release, or library. The deployed MusicNN metric
was verified as angular; individual model-artifact hashes were not exposed by the
inspected metadata endpoints. Do not reuse these numbers across other models or
releases.
