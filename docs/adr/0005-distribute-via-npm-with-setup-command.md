# Distribute via npm with an interactive setup command

The service is published only as the npm package `@xandreiathome/navidrome-playlist-mcp`
and launched by MCP clients through `npx`; container packaging is removed. Running
Navidrome already implies a self-hoster comfortable with configuration, and `npx`
removes the checkout, build, Compose file, and volume handling that Docker required.
better-sqlite3 ships prebuilt Node-API binaries for the supported platforms, so the
native dependency does not require a compiler at install time.

An interactive `setup` command verifies Navidrome (and optionally AudioMuse)
connectivity before any client is involved, then writes the server entry into the
user-scope configuration of the clients the user selects, through the `add-mcp`
library. Credentials live only in that client entry's environment block: the
service keeps no configuration file of its own and continues to read only process
environment. `setup` writes its own exact package version, so installs are pinned;
rerunning it is the upgrade and credential-change path.

When `NAVIDROME_DB_PATH` is unset, the database defaults to a per-user data
directory rather than a path relative to the process working directory, which
`npx` launches leave undefined. Existing durability and recovery guarantees are
unchanged; this decision changes installation, not behavior.

## Considered Options

- Keeping Docker alongside npm: rejected to avoid two install paths to document
  and test.
- A config file written by `setup`: rejected because it creates a second source of
  credentials with precedence rules.
- Per-client adapters maintained here: rejected in favor of `add-mcp`, which
  already supports the targeted clients' differing formats (JSON, JSONC, TOML).
- Project-scope client configs: rejected because a music library is not tied to a
  code project and project files risk committing credentials.
