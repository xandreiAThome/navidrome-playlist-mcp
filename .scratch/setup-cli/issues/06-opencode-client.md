# Support OpenCode as an install target

Status: done
Blocked by: 03

Add `opencode` to the setup client allowlist. Verify add-mcp 2.6.1's OpenCode
global config path against OpenCode's docs on Linux, macOS, and Windows, and
fall back to the manual copy wherever add-mcp writes a file OpenCode does not
read. OpenCode stores a different raw shape (`type: "local"`, the command and
arguments in one `command` array, `environment` instead of `env`, `enabled` in
the V1 layout), so the adapter's `read()` and the masked rerun diff must
recognize an unchanged entry, mask secrets in `environment`, and keep the
0600 file mode. Cover it with the fake-client tests and a real OpenCode config
in a temp HOME.

## Comments

- Path verification (add-mcp 2.6.1 `dist/chunk-JZK2SME6.js`,
  `resolveOpenCodeConfigPath`, against opencode.ai/docs/config (V2) and V1
  docs, plus OpenCode's `packages/util/src/global-roots.ts`):
  - add-mcp writes `os.homedir()/.config/opencode/opencode.jsonc`, or an
    existing `opencode.json` there, on every platform. It ignores
    `XDG_CONFIG_HOME`.
  - OpenCode reads `${XDG_CONFIG_HOME:-~/.config}/opencode/opencode.json(c)` on
    every platform. The docs give `~/.config/opencode/opencode.json(c)` with no
    per-OS variant, and the source uses the same XDG rule on Windows
    (`%USERPROFILE%\.config\opencode`).
  - Linux, macOS, Windows: the paths match when `XDG_CONFIG_HOME` is unset or is
    `~/.config`. When it points elsewhere, add-mcp would write a file OpenCode
    does not read, so setup reads, detects, and points at
    `$XDG_CONFIG_HOME/opencode/` instead and falls back to a manual copy. That
    copy is printed in OpenCode's own shape rather than the common
    `mcpServers` shape. A config named only by `OPENCODE_CONFIG` still loads
    alongside the global file, so it needs no fallback.
- Layout: add-mcp writes the V1 `mcp.<name>` layout (with `enabled: true`)
  unless the file already uses only the V2 `mcp.servers` map. The V2 docs state
  that V1 config remains supported. `read()` resolves the key the same way.
- Done. `read()` decodes the OpenCode entry and accepts it only when it equals
  `agents.opencode.transformConfig(...)` for that entry under the same key.
  Otherwise (for example `enabled: false` or `disabled: true`, which a rewrite
  would drop) it is unrecognized and the rerun confirms. `environment` maps
  onto `env`, so the diff masks its secrets. The written file is chmodded to
  0600 like the other clients.
- Verification: `tests/e2e/add-mcp.test.ts` runs the real adapter in a temp
  HOME. It covers fresh install into an existing commented `opencode.json`
  (theme and other server kept, mode 0600), rerun with no diff, rerun with a
  changed password showing only a masked diff, both layouts, entries a rewrite
  would change being unrecognized, and the relocated `XDG_CONFIG_HOME`
  fallback leaving `~/.config/opencode` untouched. `tests/integration/setup.test.ts`
  covers the client-specific manual copy. `pnpm check` passes.
