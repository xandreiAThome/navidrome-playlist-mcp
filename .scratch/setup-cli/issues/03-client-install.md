# Install into selected clients through add-mcp

Status: done
Blocked by: 01

Add client multi-select (detected first, manual-copy option last), user-scope
`upsertServer` with the pinned version, and rerun diff-and-confirm with masked
secrets. Verify cross-platform paths for the clients flagged in the spec.

## Comments

- Done: `clientStep` (`src/setup/clients.ts`) multi-selects from our allowlist (Claude Code,
  Claude Desktop, VS Code, Cursor, Codex, Gemini CLI, GitHub Copilot CLI, Windsurf), detected
  first and preselected, manual copy last. `src/setup/add-mcp.ts` wraps add-mcp 2.6.1 (pinned)
  in user scope and chmods written files to 0600. Rerun shows a field diff with secrets masked
  and confirms (default no) before overwriting; unchanged entries are skipped.
- Client-path verification (add-mcp 2.6.1 source vs. official docs): Claude Desktop Linux
  `~/.config/Claude/claude_desktop_config.json` and Windows
  `%APPDATA%\Claude\claude_desktop_config.json` match the MCP docs; Microsoft Store (MSIX)
  installs read `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\...`, which
  add-mcp does not write (issue #50, fix PR #114 unmerged), so setup detects that and falls back
  to the manual copy with that path. VS Code writes the default-profile `User/mcp.json`
  (`servers` key) on Linux and Windows; non-default profiles and Insiders are not covered.
  Antigravity is excluded: its reported env-replaces-environment issue is unresolved and our
  entry depends on env. Zed is excluded (macOS path bug, issue #121). The adapter's
  temp-HOME child-process test confirms the Linux paths for Claude Code and Cursor.
