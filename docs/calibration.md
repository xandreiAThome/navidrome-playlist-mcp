# Calibrate AudioMuse recommendations

Calibration tells this service which recommendation scores are good enough for
**your** library. You collect candidates, listen to them, and choose two cutoffs:

- `maxDistance`: the largest similarity distance you'll accept. Lower is closer.
- `minDescriptionSimilarity`: the lowest description score you'll accept. Higher
  is closer to the prompt.

These are separate scales. There isn't a universal value to copy from another
installation, and this process doesn't train a model or rebuild an index.

## 1. Prepare your connection

Complete the [README setup](../README.md) first. Run these commands in Bash from
the repository root. You'll need Node and pnpm
for the final check, plus `curl` and `jq` for collecting samples.

Your AudioMuse library must already be analyzed. Configure these in `.env`:

```dotenv
NAVIDROME_URL=https://music.example.com
NAVIDROME_USERNAME=your-user
NAVIDROME_PASSWORD='your-subsonic-password'
AUDIOMUSE_URL=https://audiomuse.example.com
AUDIOMUSE_API_TOKEN='your-token'
AUDIOMUSE_SERVER=your-server-id
```

Load your trusted `.env` into the shell and create a directory for the results:

```bash
set -a
source .env
set +a
mkdir -p .data/calibration
```

Define a helper for read-only AudioMuse requests:

```bash
am_get() {
  local endpoint="$1"
  shift
  curl -fsS --connect-timeout 10 --max-time 60 --get \
    -H "Authorization: Bearer $AUDIOMUSE_API_TOKEN" \
    "${AUDIOMUSE_URL%/}$endpoint" \
    --data-urlencode "server=$AUDIOMUSE_SERVER" "$@"
}
```

Check the version and selected connection:

```bash
am_get /api/version | jq -e '.app_version == "v3.7.1"'
am_get /api/servers |
  jq '.servers[] | {server_id, name, server_type}'
```

The version check should print `true`. Use the `server_id` of the Navidrome
connection you want to calibrate, pointing to the same `NAVIDROME_URL` as this
service. Confirm the URL in AudioMuse's media-server settings. The current adapter
is validated for AudioMuse v3.7.1.

## 2. Collect similar-song candidates

Pick several songs you know well across the styles you actually listen to. Include
both focused and mixed listening contexts. Keep a few extra reference songs aside
for the final check, rather than choosing cutoffs from every example you'll test.

Get each song's **Navidrome track ID** through the MCP `search_tracks` tool. For
example, ask your MCP client to call:

```json
{ "query": "Plastic Love" }
```

Inspect the title, artist, album, and version before choosing an ID. Then substitute
that ID below:

```bash
REFERENCE_TRACK_ID='replace-with-a-navidrome-track-id'

am_get /api/max_distance \
  --data-urlencode "item_id=$REFERENCE_TRACK_ID" |
  jq -e '.max_distance | numbers'

am_get /api/similar_tracks \
  --data-urlencode "item_id=$REFERENCE_TRACK_ID" \
  --data-urlencode 'n=200' \
  --data-urlencode 'eliminate_duplicates=false' \
  --data-urlencode 'radius_similarity=false' \
  --data-urlencode 'mood_similarity=false' \
  > .data/calibration/similarity.json

jq --arg reference "$REFERENCE_TRACK_ID" \
  '[.[] | select(.item_id != $reference)] | sort_by(.distance) |
   .[] | {id: .item_id, title, artist: .author, distance}' \
  .data/calibration/similarity.json
```

Repeat for your other reference songs, saving each response under a different
filename. A failed availability request is a problem to investigate, not evidence
that no similar songs exist.

## 3. Collect description candidates

Use descriptions you expect to ask your assistant for, such as “city pop”, “rock
ballads”, or “calm instrumental jazz”. Save one response per description:

```bash
DESCRIPTION='calm instrumental jazz'

jq -n --arg query "$DESCRIPTION" '{query: $query, limit: 200}' \
  > .data/calibration/description-request.json

SERVER_QUERY="$(jq -rn --arg server "$AUDIOMUSE_SERVER" '$server | @uri')"

curl -fsS --connect-timeout 10 --max-time 60 \
  -H "Authorization: Bearer $AUDIOMUSE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @.data/calibration/description-request.json \
  "${AUDIOMUSE_URL%/}/api/clap/search?server=$SERVER_QUERY" > .data/calibration/description.json

jq '.results | sort_by(.similarity) | reverse | .[] |
    {id: .item_id, title, artist: .author, similarity}' \
  .data/calibration/description.json
```

These requests collect candidates directly from AudioMuse, so they work before
this service has a calibration file. They don't create playlists. The raw results
haven't passed this service's library validation or alternate-recording filters.

## 4. Listen, rate, and choose cutoffs

Listen to candidates in Navidrome. Record the reference or description, candidate
ID, score, and your judgment in `.data/calibration/report.md`. Rate examples near
possible boundaries, including poor fits; don't judge quality from scores alone.
Membership in an existing playlist isn't proof of a good or bad match.

A simple record looks like this. **These scores are invented examples:**

| Kind        | Reference or description | Candidate ID | Score | Judgment |
| ----------- | ------------------------ | ------------ | ----- | -------- |
| Similarity  | Reference track A        | track-1      | 0.04  | Good     |
| Similarity  | Reference track B        | track-2      | 0.08  | Good     |
| Similarity  | Reference track A        | track-3      | 0.15  | Poor     |
| Description | calm instrumental jazz   | track-4      | 0.70  | Good     |
| Description | rock ballads             | track-5      | 0.62  | Good     |
| Description | calm instrumental jazz   | track-6      | 0.48  | Poor     |

For an initial conservative boundary, take the largest accepted distance and the
smallest accepted description score. In this example those are **0.08** and
**0.62**. The filters include the boundary value itself.

Check every rated example that those cutoffs would admit. If an accepted range
also contains poor fits, tighten the cutoff and accept the resulting shortages.
If no useful cutoff separates the results, collect more ratings or investigate
the model/index; a single score cannot capture every musical preference. Don't
loosen a cutoff just to fill a requested count.

Also record the AudioMuse release, model names/versions, distance metric, and index
build or analysis date. These explain which deployment your ratings describe.

## 5. Write the calibration file

Set these to the values you measured, replacing the illustrative numbers:

```bash
MAX_DISTANCE='0.08'
MIN_DESCRIPTION_SIMILARITY='0.62'
INDEX_MODEL='replace-with-models-metric-and-index-build-or-analysis-date'

jq -n \
  --arg audiomuseUrl "${AUDIOMUSE_URL%/}" \
  --arg navidromeUrl "${NAVIDROME_URL%/}" \
  --arg server "$AUDIOMUSE_SERVER" \
  --arg indexModel "$INDEX_MODEL" \
  --arg report '.data/calibration/report.md' \
  --argjson maxDistance "$MAX_DISTANCE" \
  --argjson minDescriptionSimilarity "$MIN_DESCRIPTION_SIMILARITY" \
  '{audiomuseUrl: $audiomuseUrl, navidromeUrl: $navidromeUrl,
    server: $server, version: "v3.7.1", indexModel: $indexModel,
    report: $report, maxDistance: $maxDistance,
    minDescriptionSimilarity: $minDescriptionSimilarity}' \
  > .data/audiomuse-calibration.json
```

Add its absolute path to `.env`:

```dotenv
AUDIOMUSE_CALIBRATION_PATH=/absolute/path/to/navidrome-mcp/.data/audiomuse-calibration.json
```

For Docker, the file must be mounted into the container. Create
`compose.override.yaml`:

```yaml
services:
  navidrome-mcp:
    volumes:
      - ./.data/audiomuse-calibration.json:/config/audiomuse-calibration.json:ro
    environment:
      AUDIOMUSE_CALIBRATION_PATH: /config/audiomuse-calibration.json
```

The MCP configuration in the README passes an explicit `--file`. Add another
`--file` argument for `/absolute/path/to/navidrome-mcp/compose.override.yaml`
after the existing Compose file argument so this mount is included.

## 6. Verify through the service

Build the service and reconnect your MCP client so it loads the new configuration:

```bash
pnpm build
# For Docker instead:
# docker compose build
```

Call `check_audiomuse_connection` with `{}`. It should return `status: "ok"`,
`connected: true`, and `calibrated: true`. That confirms configuration and version
compatibility, not recommendation quality.

Then test your held-aside songs and descriptions with these tools:

| Tool                  | Example input                                             |
| --------------------- | --------------------------------------------------------- |
| `find_similar_tracks` | `{"trackId":"your-held-aside-track-id","count":5}`        |
| `discover_tracks`     | `{"description":"your-held-aside-description","count":5}` |

Check the returned recommendations by listening. Similarity results must have
`recommendation.score <= maxDistance`; description results must have
`recommendation.score >= minDescriptionSimilarity`. A `shortfall` is expected when
not enough candidates meet the cutoff. Record what you tested and any failures
in your report. These two tools don't create or update remote playlists.

If this final check exposes poor fits, revise the cutoffs and repeat it with fresh
examples. A small calibration is a starting point, not a guarantee for all queries.

## When to repeat this

Recalibrate after changing the AudioMuse release, models, distance metric, index
settings, or library. The application checks URLs, server selection, and release,
but it cannot detect every model or index change for you.
