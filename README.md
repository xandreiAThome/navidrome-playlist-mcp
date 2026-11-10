# Navidrome MCP

Create ordered Navidrome playlists from song lists through a local MCP client.
The service matches tracks, saves drafts, previews changes, and records publishing
outcomes. It connects to an existing Navidrome instance using MCP over stdio.

## Docker Compose

Requires Docker with Compose.

```sh
cp .env.docker.example .env
# Edit .env with your Navidrome URL, username, and Subsonic password.
chmod 600 .env
docker compose build
```

Keep your existing `.env` if already configured. For Navidrome on the Docker host,
use `http://host.docker.internal:4533`; Navidrome must listen on an interface the
container can reach. Single-quote passwords containing `$` or `#` in `.env`.

Add this to your MCP client's configuration, replacing the absolute paths:

```json
{
  "mcpServers": {
    "navidrome": {
      "command": "docker",
      "args": [
        "compose",
        "--project-directory",
        "/absolute/path/to/navidrome-mcp",
        "--file",
        "/absolute/path/to/navidrome-mcp/compose.yaml",
        "--env-file",
        "/absolute/path/to/navidrome-mcp/.env",
        "run",
        "--rm",
        "-T",
        "navidrome-mcp"
      ]
    }
  }
}
```

For a manual foreground launch:

```sh
docker compose run --rm -T navidrome-mcp
```

The service waits for MCP messages on stdin. Use `compose run` for each client
connection; `compose up -d` provides no MCP endpoint.

## Local setup

Requires Node **26.13.0** (see `.nvmrc`) and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm build
cp .env.example .env
# Edit .env with your Navidrome credentials and an absolute NAVIDROME_DB_PATH.
node --env-file=.env dist/cli.js
```

For an MCP client, use `node` as the command and pass
`--env-file=/absolute/path/to/.env` and `/absolute/path/to/dist/cli.js` as arguments.

## Configuration

Required: `NAVIDROME_URL`, `NAVIDROME_USERNAME`, and `NAVIDROME_PASSWORD`.
Use the server's HTTP(S) base URL without `/rest` or embedded credentials.

Optional settings, including request timeouts and search limits, are listed in
[.env.example](.env.example). Set `NAVIDROME_REQUIRE_APPROVAL=true` to require an
agent assertion that the user approved the exact preview revision. Keep credentials
in the process environment or `.env`, outside tool arguments.

## Workflow

1. Call `check_connection`, then `resolve_tracks` with songs containing `title` and
   `artist` (optionally `album`, `version`, and `duration`).
2. Review matches. Explicitly select ambiguous tracks or omit unwanted entries;
   missing or incomplete searches must not be silently treated as resolved.
3. Use `save_playlist_draft`, then `preview_playlist`. Drafts default to public;
   set `visibility: "private"` when needed.
4. Call `publish_playlist` with the previewed revision and a stable `operationKey`.
   Check `data.status`: only `succeeded` confirms publication.

Publishing creates a new playlist. Repeated requests return the recorded operation;
use `copy_playlist_draft` to intentionally create another playlist.

For incomplete operations, inspect `get_operation` and use `reconcile_operation`.
Resume a known playlist ID; an `unknown_outcome` requires explicitly adopting a
verified playlist or confirming non-creation before retrying. A new operation key
cannot bypass recovery.

## Storage and upgrades

Docker stores SQLite in the `playlist-data` volume at `/data/playlists.sqlite`.
Local runs default to `.data/playlists.sqlite`. Keep the same server URL and
username for an existing database; host databases are not automatically imported
into Docker.

Pending database migrations run automatically at startup in one transaction.
Failure rolls back the migration and stops startup. Before upgrading, stop clients
and back up the database, then rebuild with `docker compose build --pull` and
reconnect. Retain the volume: `docker compose down --volumes` deletes stored state.
Rollback requires restoring the pre-upgrade backup.

## Development

```sh
pnpm check             # formatting, lint, typecheck, build, all tests
pnpm test:watch        # integration tests while editing
pnpm test:coverage     # coverage report
```
