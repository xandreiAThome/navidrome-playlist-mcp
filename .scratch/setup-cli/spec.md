# Interactive setup command

Status: ready-for-agent

Blocked by: [npm-distribution](../npm-distribution/spec.md).
Decision record: [ADR 0005](../../docs/adr/0005-distribute-via-npm-with-setup-command.md).

## Problem Statement

Configuration mistakes (wrong URL, `/rest` suffix, quoting, unreachable server)
surface only after an MCP client restart, as a deliberately generic startup error.
Each client stores MCP servers in a different file and format.

## Solution

`npx @xandreiathome/navidrome-playlist-mcp@latest setup` verifies connections first,
then installs the server entry into the user-scope config of the clients the user
selects. Success means one command plus one client restart.

## User Stories

- As a first-time user, I enter my Navidrome URL, username, and password and learn
  immediately whether they work.
- As a user of several agents, I pick which clients to install into from a list
  that shows my installed clients first.
- As an AudioMuse user, I opt in, enter its URL and token, and the matching server
  is found for me.
- As an existing user, I rerun `setup` to upgrade or change credentials, seeing
  what will change before it is written.
- As a scripter, I run `setup` non-interactively without putting secrets on the
  command line.

## Implementation Decisions

- Navidrome step: prompt URL, username, password (hidden). Normalize the URL
  (trailing `/`, `/rest`). Verify reachability and authentication through the
  existing adapter; show server version and authenticated user. On failure, explain
  and re-prompt that value; never write a failing configuration.
- AudioMuse step: ask "Set up AudioMuse recommendations? (y/N)". On yes, prompt URL
  and token (hidden); verify authentication and that the release is in the
  supported minor (see [audiomuse-3.7.4](../audiomuse-3.7.4/spec.md)); select the
  `/api/servers` entry whose `creds.url` matches `NAVIDROME_URL`, asking when
  several match and explaining when none do. An unsupported release fails the step
  with an offer to skip it. On success write `AUDIOMUSE_URL`,
  `AUDIOMUSE_API_TOKEN`, and the detected `AUDIOMUSE_SERVER` (which remains
  required at runtime when AudioMuse is configured). Close with "ask your assistant
  to calibrate recommendations".
- Client selection: multi-select from `add-mcp`'s supported agents, detected global
  agents first and preselected, then the rest, then "Show config to copy manually"
  (prints the command, args, and env).
- Writing: `add-mcp` library `upsertServer` in user (global) scope only, entry name
  `navidrome`, command `npx -y @xandreiathome/navidrome-playlist-mcp@<own version>`,
  credentials only in the entry's env. No config file of our own.
- Rerun: when an entry exists, show a diff with secrets masked and confirm before
  overwriting; leave other servers untouched.
- Flags: `--url`, `--username`, `--client` (repeatable), `--audiomuse-url`, `--yes`.
  Secrets only from hidden prompts or `NAVIDROME_PASSWORD` / `AUDIOMUSE_API_TOKEN`
  environment variables, never flags.
- Running with no subcommand keeps starting the stdio server, so existing client
  configs keep working.
- Verify `add-mcp`'s Linux and Windows paths for Claude Desktop and VS Code, and the
  reported Antigravity env-var issue, before listing those clients as supported.

## Testing Decisions

- Drive the prompt flow through an injected prompt interface against fake Navidrome
  and AudioMuse HTTP fixtures; write client configs into a temporary home directory.
- Cover URL normalization, re-prompt on failure, AudioMuse server matching (one,
  many, none), unsupported release, rerun diff masking, and flag mode.

## Out of Scope

- Calibration (see [guided-calibration](../guided-calibration/spec.md)), a
  standalone `check` command, project-scope installs, and our own config file.
