# Review AudioMuse v3.7.1...v3.7.4 for adapter-relevant changes

Status: resolved

Read the upstream source diff for the five endpoints, auth, and the `server`
parameter listed in the [spec](../spec.md), plus both security advisories. Record
findings (with file/line links at the v3.7.4 tag) under `## Answer` in this issue.
If any request or response contract changed, stop and raise it before ticket 02.

## Comments

## Answer

No adapter-relevant contract changed. Source diff `v3.7.1...v3.7.4` (74 commits, 68 files)
is song player, song demo, smart fade, Search by Recording, chat tooling, backups, and UI.
None of `app_auth.py`, `app_music_servers.py`, `app_ivf.py`, `app_clap_search.py`,
`app_server_context.py`, `tasks/ivf_manager.py`, `tasks/clap_text_search.py`, or the
media-server registry changed.

- `/api/version`: unchanged route ([app.py#L329](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app.py#L329)); only
  `APP_VERSION` changed to `"v3.7.4"` ([config.py#L338](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/config.py#L338)), same format.
- `/api/servers`: unchanged ([app_music_servers.py#L390](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app_music_servers.py#L390));
  `creds` still returned to admin (bearer) callers.
- `/api/similar_tracks` and `/api/max_distance`: unchanged
  ([app_ivf.py#L368](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app_ivf.py#L368), [app_ivf.py#L582](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app_ivf.py#L582)).
- `/api/clap/search`: unchanged ([app_clap_search.py#L76](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app_clap_search.py#L76)).
- Bearer auth: unchanged ([app_auth.py#L693-L702](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app_auth.py#L693-L702)); the diff adds
  no `before_request` hooks or auth exemptions.
- `server` parameter: unchanged ([app_server_context.py#L64](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/app_server_context.py#L64)).
- Score scales: `IVF_METRIC` stays `angular` ([config.py#L1404](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/config.py#L1404)), and
  `EMBEDDING_DIMENSION` stays 200 ([config.py#L938](https://github.com/NeptuneHub/AudioMuse-AI/blob/v3.7.4/config.py#L938)). The CLAP model paths
  and the `MAX_DISTANCE` default are also unchanged. The remaining `config.py` changes only add
  new constants for smart fade, song demo, and the neural-fingerprint duplicate threshold.
- The golden API snapshot changes only `recording_search` entries.
- GHSA-8ph4-3rgv-8hvr: chat `_key_hints()` DoS. Our v3.7.1 baseline already has the 3.7.1
  patch, and we do not use chat endpoints. No effect.
- GHSA-vww2-v52c-r98r: stored XSS through the Alchemy anchor name, which could be used to
  rotate `API_TOKEN`. The 3.7.4 fix changes only `templates/alchemy.html` (`textContent`).
  It does not change auth or request handling. No effect on the adapter.

Conclusion: v3.7.4 is compatible, and v3.7.1 calibration thresholds remain numerically
applicable. Ticket 02 can proceed. Detailed notes were recorded in the research session
scratchpad (`audiomuse-3.7.4/diff-review.md`).
