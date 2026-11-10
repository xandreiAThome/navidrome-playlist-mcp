# Navidrome MCP

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

Your MCP client starts the server when it connects. Use `compose run`, as shown,
rather than `compose up -d`: this server communicates over stdin/stdout.

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
["--env-file=/absolute/path/to/navidrome-mcp/.env", "/absolute/path/to/navidrome-mcp/dist/cli.js"]
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
