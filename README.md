# Navidrome Playlist MCP

Let your AI assistant create and extend playlists in your Navidrome library.
Connect it to an MCP client, then ask for what you want:

- “Make a private playlist with these songs.”
- “Add this song list to my Road Trip playlist.”
- “Find songs similar to these and add them to Evening.” (Requires AudioMuse.)

You can review matches and preview the result before anything changes in
Navidrome. Existing playlists keep their name, visibility, and track order.

## Get started

You'll need a running Navidrome server and Node 26.13.0 or newer.

Add this to your MCP client's configuration, replacing `<version>` with a
published version and the values with your own:

```json
{
  "mcpServers": {
    "navidrome": {
      "command": "npx",
      "args": ["-y", "@xandreiathome/navidrome-playlist-mcp@<version>"],
      "env": {
        "NAVIDROME_URL": "http://localhost:4533",
        "NAVIDROME_USERNAME": "your-user",
        "NAVIDROME_PASSWORD": "your-subsonic-password"
      }
    }
  }
}
```

Use your Navidrome base URL, without `/rest`. Your MCP client starts the server
when it connects; it communicates over stdin/stdout. The installed server reads
settings only from its process environment, so put them in the client's `env`
block rather than a `.env` file. [.env.example](.env.example) lists every setting.
Pinning the version means upgrades happen only when you change it.

### Moving from Docker

Earlier versions ran in Docker and kept the database in the `playlist-data`
volume. Stop your MCP clients, then copy the database files out of the volume
(Compose named it `navidrome-mcp_playlist-data`; `docker volume ls` shows it):

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  -v navidrome-mcp_playlist-data:/data:ro -v "$PWD":/backup \
  alpine sh -c 'cp /data/playlists.sqlite* /backup/'
```

Set `NAVIDROME_DB_PATH` to the absolute path of the copied `playlists.sqlite`.
A database only opens with the exact `NAVIDROME_URL` and username that created
it, so keep the same URL. If you used `http://host.docker.internal:4533`, keep
that value and make the name resolve to Navidrome's address on this machine (for
example, a hosts-file entry). After confirming the copy works, you can delete the
volume and the `navidrome-mcp:local` image.

## Run locally instead

Requires Node 26.13.0 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Copy [.env.example](.env.example) to `.env` if you haven't configured one already.
Fill in your Navidrome credentials. `NAVIDROME_DB_PATH` is optional; leave it
unset to use the per-user default described under
[A few things to know](#a-few-things-to-know). The `AUDIOMUSE_CALIBRATION_PATH` you set must also be absolute: relative paths
resolve against the MCP client's working directory, which may not be this
checkout.

For your MCP client, use `node` as the command with these arguments:

```json
[
  "--env-file=/absolute/path/to/navidrome-playlist-mcp/.env",
  "/absolute/path/to/navidrome-playlist-mcp/dist/cli.js"
]
```

## Want recommendations?

Song lists work on their own. For similarity and description-based
recommendations, connect a separately installed AudioMuse-AI 3.7.x instance (validated on v3.7.4).

Set `AUDIOMUSE_URL`, `AUDIOMUSE_API_TOKEN`, and `AUDIOMUSE_SERVER` alongside the\nNavidrome settings.
The server value is the `server_id` of your Navidrome connection in AudioMuse's
`GET /api/servers` response. Discovery also needs
`AUDIOMUSE_CALIBRATION_PATH`, a quality-calibration file for your deployment.

See [AudioMuse setup](docs/discovery.md) for connection details and the
[calibration guide](docs/calibration.md) for commands to collect, rate, and verify
recommendations.

## Available tools

Your MCP client exposes these tools to your assistant. Draft edits stay local;
`publish_playlist` creates a playlist in Navidrome and `apply_playlist_update`
appends to an existing one. Recovery tools can also complete remote writes.

| Library tool       | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `check_connection` | Check Navidrome connectivity and authentication.       |
| `search_tracks`    | Search the library for recordings.                     |
| `resolve_tracks`   | Match an ordered song list and flag uncertain matches. |
| `list_playlists`   | List existing playlists and their IDs.                 |
| `get_playlist`     | Read a playlist's ordered tracks and visibility.       |

| New playlist tool     | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `save_playlist_draft` | Create or edit a draft with selected tracks and omissions. |
| `get_playlist_draft`  | Read a draft or a saved revision.                          |
| `copy_playlist_draft` | Copy a revision into a new editable draft.                 |
| `preview_playlist`    | Review and record the exact revision to publish.           |
| `publish_playlist`    | Create a new playlist from a previewed revision.           |
| `get_operation`       | Inspect a publication's outcome and recovery state.        |
| `reconcile_operation` | Recover an incomplete or uncertain publication.            |

| Existing playlist tool      | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `save_playlist_update`      | Draft additions to a playlist, with optional reference songs. |
| `get_playlist_update`       | Read an update draft or a saved revision.                     |
| `preview_playlist_update`   | Review additions and the full resulting track order.          |
| `refresh_playlist_update`   | Refresh the target snapshot after a conflict.                 |
| `apply_playlist_update`     | Append previewed additions, preserving name and visibility.   |
| `get_update_operation`      | Inspect an append's outcome and compare playlist states.      |
| `reconcile_playlist_update` | Resolve an uncertain append after external investigation.     |

| Recommendation tool            | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `check_audiomuse_connection`   | Check AudioMuse connectivity and calibration configuration.     |
| `discover_tracks`              | Find library tracks from a listening description.               |
| `find_similar_tracks`          | Find tracks similar to one library recording.                   |
| `configure_playlist_discovery` | Choose a draft's reference tracks and retained recommendations. |
| `expand_playlist_draft`        | Add recommendations to a resolved new-playlist draft.           |
| `expand_playlist_update`       | Recommend additions using an update's reference songs.          |

Discovery and recommendation generation require the optional AudioMuse setup
described above. Reference and retention choices are saved locally.
See [playlist workflows and recovery](docs/playlist-workflows.md) for usage and
retry rules.

## A few things to know

- New playlists default to public. Ask for private when you want it.
- Set `NAVIDROME_REQUIRE_APPROVAL=true` to require your agent to assert approval
  of the exact preview before writing.
- Drafts and recovery history persist in SQLite. Local runs default to
  `navidrome-playlist-mcp/playlists.sqlite` in your per-user data directory, so
  every MCP client shares one database regardless of its working directory:
  - Linux: `$XDG_DATA_HOME`, or `~/.local/share` when unset.
  - macOS: `~/Library/Application Support`.
  - Windows: `%LOCALAPPDATA%`.

  Set `NAVIDROME_DB_PATH` to use another location. Keep backups when upgrading.

- Upgrading from a version that stored the database in `.data/playlists.sqlite`
  under the working directory? Either set `NAVIDROME_DB_PATH` to that file's
  absolute path or move the file to the new default location. The server does not
  detect or import the old file.
- If a write's outcome is uncertain, inspect and reconcile it before trying again.
  The server blocks uncertain appends to prevent accidental duplicates.
- If the server exits immediately, it prints one generic startup error on purpose.
  Check that absolute paths in `.env` (`NAVIDROME_DB_PATH`,
  `AUDIOMUSE_CALIBRATION_PATH`) still exist after moving or renaming the checkout.
- Keep credentials in `.env` or your process environment.

[Playlist workflows and recovery](docs/playlist-workflows.md) explains the tools.
[.env.example](.env.example) lists the available settings.

## Development

```sh
pnpm dev
pnpm check       # formatting, lint, types, build, and tests
pnpm test:watch  # integration tests while editing
```

See the [project map](docs/project-map.md), [architecture](docs/architecture.md),
and [coding standards](docs/coding-standards.md) for more detail.
