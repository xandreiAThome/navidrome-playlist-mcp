# Navidrome Playlist MCP

Let your AI assistant create and extend playlists in your Navidrome library.
Connect it to an MCP client, then ask for what you want:

- “Make a private playlist with these songs.”
- “Add this song list to my Road Trip playlist.”
- “Find songs similar to these and add them to Evening.” (Requires AudioMuse.)

You can review matches and preview the result before anything changes in
Navidrome. Existing playlists keep their name, visibility, and track order.

## Get started

You'll need a running Navidrome server and Node 26.13.0 or newer. Run:

```sh
npx @xandreiathome/navidrome-playlist-mcp@latest setup
```

Setup asks for your Navidrome URL, username, and password, and checks them
before going further. It shows the server version and account it connected to,
and asks again for any value that fails, so it never saves a configuration that
doesn't work. You can paste the URL with or without a trailing `/` or `/rest`.

It then offers to set up AudioMuse recommendations (see
[Want recommendations?](#want-recommendations)) and asks which MCP clients to
install the server into. Clients found on this machine are listed first and
preselected. Supported clients are Claude Code, Claude Desktop, VS Code, Cursor,
Codex, Gemini CLI, GitHub Copilot CLI, Windsurf, and OpenCode. For anything else, choose
"Show config to copy manually". Restart your MCP client afterwards to load the
server.

Setup adds a `navidrome` server to each client's user-level configuration,
pinned to the version you ran, and leaves the client's other servers alone. It
keeps your credentials only in that entry's `env` block and makes the file
readable only by you. To upgrade or change credentials, run setup again. When a
client already has the entry, setup shows what would change, with secrets
masked, and asks before overwriting. If `XDG_CONFIG_HOME` points somewhere
other than `~/.config`, setup prints the OpenCode entry for you to copy instead
of writing it.

### Run setup without prompts

Flags answer setup's questions so it can run from a script:

| Flag                    | Answers                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `--url <url>`           | The Navidrome URL.                                                                |
| `--username <name>`     | The Navidrome username.                                                           |
| `--client <id>`         | A client to install into; repeat for several. `manual` prints the config to copy. |
| `--audiomuse-url <url>` | Sets up AudioMuse at this URL.                                                    |
| `--yes`, `-y`           | Asks nothing; see below.                                                          |

Client IDs are `claude-code`, `claude-desktop`, `vscode`, `cursor`, `codex`,
`gemini-cli`, `github-copilot-cli`, `windsurf`, `opencode`, and `manual`. Secrets are never
flags: setup reads the password from `NAVIDROME_PASSWORD` and the AudioMuse
token from `AUDIOMUSE_API_TOKEN`, or asks for them. Without `--yes`, setup asks
only for what the flags leave out. `--yes` needs `--url`, `--username`,
`--client`, and `NAVIDROME_PASSWORD` (plus `AUDIOMUSE_API_TOKEN` with
`--audiomuse-url`), skips AudioMuse without `--audiomuse-url`, and stops before
writing anything if a value fails its check. It overwrites an existing entry
after showing its masked diff.

```sh
NAVIDROME_PASSWORD=... npx @xandreiathome/navidrome-playlist-mcp@latest setup \
  --yes --url https://music.example.com --username me --client claude-code
```

### Configure a client by hand

Your MCP client starts the server over stdin/stdout. The installed server reads
settings only from its process environment, so put them in the client's `env`
block rather than a `.env` file:

| Variable              | Value                                         |
| --------------------- | --------------------------------------------- |
| `NAVIDROME_URL`       | Your Navidrome base URL, without `/rest`.     |
| `NAVIDROME_USERNAME`  | Your Navidrome username.                      |
| `NAVIDROME_PASSWORD`  | Your Navidrome (Subsonic) password.           |
| `AUDIOMUSE_URL`       | Optional. Your AudioMuse-AI URL.              |
| `AUDIOMUSE_API_TOKEN` | Optional. Your AudioMuse API token.           |
| `AUDIOMUSE_SERVER`    | Required with AudioMuse. Its media server ID. |

[.env.example](.env.example) lists every setting. For example, replacing
`<version>` with a published version:

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

Pinning the version means upgrades happen only when you change it.

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
recommendations, connect a separately installed AudioMuse-AI 3.7.x instance
(validated on v3.7.4).

Answer yes when setup asks "Set up AudioMuse recommendations?", then enter
AudioMuse's URL and API token. Setup checks the token and the release, and finds
the AudioMuse media server that matches your Navidrome URL, asking you to choose
when several match. Once it's installed, ask your assistant to calibrate
recommendations.

Discovery also needs `AUDIOMUSE_CALIBRATION_PATH`, a quality-calibration file for
your deployment, which setup doesn't write yet. The
[calibration guide](docs/calibration.md) has commands to collect, rate, and
verify recommendations. To configure AudioMuse by hand, see
[AudioMuse setup](docs/discovery.md); `AUDIOMUSE_SERVER` is the `server_id` of
your Navidrome connection in AudioMuse's `GET /api/servers` response.

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

| Recommendation tool              | Purpose                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `check_audiomuse_connection`     | Check AudioMuse connectivity and each scale's calibration.      |
| `reset_calibration`              | Mark a scale stale after an AudioMuse model or index change.    |
| `discover_tracks`                | Find library tracks from a listening description.               |
| `find_similar_tracks`            | Find tracks similar to one library recording.                   |
| `configure_playlist_discovery`   | Choose a draft's reference tracks and retained recommendations. |
| `expand_playlist_draft`          | Add recommendations to a resolved new-playlist draft.           |
| `expand_playlist_update`         | Recommend additions using an update's reference songs.          |
| `collect_calibration_candidates` | Collect candidates with raw scores for a calibration probe.     |
| `record_calibration_ratings`     | Record good or poor ratings of calibration candidates.          |

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
