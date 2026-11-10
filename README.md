# Navidrome Playlist MCP

Let your AI assistant create and extend playlists in your Navidrome library.
Connect it to an MCP client, then ask for what you want:

- “Make a private playlist with these songs.”
- “Add this song list to my Road Trip playlist.”
- “Find songs similar to these and add them to Evening.” (Requires AudioMuse.)

You can review matches and preview the result before anything changes in
Navidrome. Existing playlists keep their name, visibility, and track order.

## Get started with Docker

You'll need a running Navidrome server and Docker with Compose.

If you don't already have a configured `.env`:

```sh
cp .env.docker.example .env
chmod 600 .env
```

Edit these values in `.env`:

```dotenv
NAVIDROME_URL=http://host.docker.internal:4533
NAVIDROME_USERNAME=your-user
NAVIDROME_PASSWORD='your-subsonic-password'
```

Use your Navidrome base URL, without `/rest`. The example above reaches Navidrome
on the Docker host; it must listen on an address the container can reach.
Keep passwords containing `$` or `#` single-quoted.

Build the image:

```sh
docker compose build
```

Add this to your MCP client's configuration and replace the paths:
The example includes `compose.override.yaml` for the AudioMuse calibration mount
described in the [calibration guide](docs/calibration.md). If you haven't created
that override, omit its `--file` argument and path.

```json
{
  "mcpServers": {
    "navidrome": {
      "command": "docker",
      "args": [
        "compose",
        "--project-directory",
        "/absolute/path/to/navidrome-playlist-mcp",
        "--file",
        "/absolute/path/to/navidrome-playlist-mcp/compose.yaml",
        "--file",
        "/absolute/path/to/navidrome-playlist-mcp/compose.override.yaml",
        "--env-file",
        "/absolute/path/to/navidrome-playlist-mcp/.env",
        "run",
        "--rm",
        "-T",
        "navidrome-mcp"
      ]
    }
  }
}
```

Your MCP client starts the server when it connects. Use `compose run`, as shown,
rather than `compose up -d`: this server communicates over stdin/stdout.
`--rm` removes the container when the client disconnects, and `-T` disables the
terminal so MCP messages pass through unchanged. Explicit `--file` arguments
disable automatic override loading, so include both files when using the
calibration mount.

## Run locally instead

Requires Node 26.13.0 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Copy [.env.example](.env.example) to `.env` if you haven't configured one already.
Fill in your Navidrome credentials and set `NAVIDROME_DB_PATH` to an absolute path.

For your MCP client, use `node` as the command with these arguments:

```json
[
  "--env-file=/absolute/path/to/navidrome-playlist-mcp/.env",
  "/absolute/path/to/navidrome-playlist-mcp/dist/cli.js"
]
```

## Want recommendations?

Song lists work on their own. For similarity and description-based
recommendations, connect a separately installed AudioMuse-AI v3.7.1 instance.

Set `AUDIOMUSE_URL`, `AUDIOMUSE_API_TOKEN`, and `AUDIOMUSE_SERVER` in `.env`.
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
- Drafts and recovery history persist in SQLite: Docker uses the `playlist-data`
  volume; local runs default to `.data/playlists.sqlite`. Keep backups and retain
  the volume when upgrading.
- If a write's outcome is uncertain, inspect and reconcile it before trying again.
  The server blocks uncertain appends to prevent accidental duplicates.
- Keep credentials in `.env` or your process environment.

[Playlist workflows and recovery](docs/playlist-workflows.md) explains the tools.
[.env.example](.env.example) lists the available settings.

## Development

```sh
pnpm check       # formatting, lint, types, build, and tests
pnpm test:watch  # integration tests while editing
```

See the [project map](docs/project-map.md), [architecture](docs/architecture.md),
and [coding standards](docs/coding-standards.md) for more detail.
