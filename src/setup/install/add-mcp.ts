import { chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as TOML from '@iarna/toml';
import { agents, detectGlobalAgents, getAgentTypes, upsertServer } from 'add-mcp';
import * as jsonc from 'jsonc-parser';
import type { AgentType } from 'add-mcp';
import { z } from 'zod';
import { SUPPORTED_CLIENTS } from '../steps/clients.ts';
import type { ClientId, Clients } from '../steps/clients.ts';
import { ENTRY_NAME } from './entry.ts';
import type { ServerEntry } from './entry.ts';

// Compile-time guard: every allowlisted client is an add-mcp agent.
SUPPORTED_CLIENTS satisfies readonly AgentType[];

/** The stdio fields most supported clients store; other fields are ignored. */
const onDisk = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

/** OpenCode's local server shape: the command and its arguments in one array. */
const openCodeOnDisk = z.object({
  command: z.array(z.string()),
  environment: z.record(z.string(), z.string()).default({}),
});

/** Shown in place of an existing entry setup cannot interpret, forcing a confirm. */
const UNRECOGNIZED: ServerEntry = { command: '(unrecognized entry)', args: [], env: {} };

/**
 * OpenCode's global config directory when `XDG_CONFIG_HOME` moves it away from
 * `~/.config`. OpenCode reads `$XDG_CONFIG_HOME/opencode` on every platform,
 * but add-mcp 2.6.1 always writes `~/.config/opencode`.
 */
function relocatedOpenCodeDir(): string | undefined {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (!xdg) return undefined;
  const dir = join(xdg, 'opencode');
  return resolve(dir) === resolve(dirname(agents.opencode.configPath)) ? undefined : dir;
}

/**
 * The user-scope file the client reads and add-mcp writes. For OpenCode an
 * existing `opencode.jsonc`, then `opencode.json`, is used, as add-mcp does.
 */
function configPath(id: ClientId): string {
  const agent = agents[id];
  const relocated = id === 'opencode' ? relocatedOpenCodeDir() : undefined;
  if (relocated) {
    const jsoncFile = join(relocated, 'opencode.jsonc');
    const jsonFile = join(relocated, 'opencode.json');
    return !existsSync(jsoncFile) && existsSync(jsonFile) ? jsonFile : jsoncFile;
  }
  return agent.resolveConfigPath?.(agent, { local: false, cwd: process.cwd() }) ?? agent.configPath;
}

/**
 * The client's user-scope file, parsed with the parsers add-mcp itself uses, or
 * `null` when it does not exist. Throws when the file cannot be parsed.
 */
function readConfig(id: ClientId): unknown {
  const agent = agents[id];
  const path = configPath(id);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const errors: jsonc.ParseError[] = [];
  const config: unknown =
    agent.format === 'toml'
      ? TOML.parse(text)
      : agent.format === 'json'
        ? jsonc.parse(text, errors, { allowTrailingComma: true })
        : undefined;
  if (config === undefined || errors.length) throw new Error('Unreadable client configuration');
  return config;
}

function child(node: unknown, key: string): unknown {
  if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) return undefined;
  // Checked above to be an object owning `key`; TypeScript cannot index `object`.
  return (node as Record<string, unknown>)[key];
}

const OPENCODE_NATIVE_KEY = 'mcp.servers';
const OPENCODE_LEGACY_KEY = 'mcp';

function isOpenCodeServer(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    ['type', 'command', 'url', 'enabled', 'disabled'].some((k) => Object.hasOwn(value, k))
  );
}

/**
 * The key an OpenCode entry belongs under, resolved as add-mcp 2.6.1's upsert
 * does: wherever the entry already is, else the native `mcp.servers` map when
 * the file uses only that layout, else the V1 `mcp` map, which OpenCode V2
 * still reads.
 */
function openCodeKey(config: unknown): string {
  const mcp = child(config, 'mcp');
  const servers = child(mcp, 'servers');
  const nativeMap =
    !!servers &&
    typeof servers === 'object' &&
    !Array.isArray(servers) &&
    !isOpenCodeServer(servers);
  if (nativeMap && Object.hasOwn(servers, ENTRY_NAME)) return OPENCODE_NATIVE_KEY;
  if (isOpenCodeServer(child(mcp, ENTRY_NAME))) return OPENCODE_LEGACY_KEY;
  const legacy =
    !!mcp &&
    typeof mcp === 'object' &&
    Object.entries(mcp).some(([name, value]) => name !== 'servers' && isOpenCodeServer(value));
  return nativeMap && !legacy ? OPENCODE_NATIVE_KEY : OPENCODE_LEGACY_KEY;
}

/**
 * The named server entry in a client's user-scope file, raw as stored, with the
 * key it sits under; `null` when the file or entry is absent. add-mcp 2.6.1's
 * `listInstalledServers` reports an undetected client (for example Claude Code
 * with `~/.claude.json` but no `~/.claude/`) as empty without reading its file,
 * so the file is read here. Throws when the file cannot be parsed.
 */
function storedEntry(id: ClientId): { raw: unknown; configKey: string } | null {
  const config = readConfig(id);
  if (config === null) return null;
  const configKey = id === 'opencode' ? openCodeKey(config) : agents[id].configKey;
  let node: unknown = config;
  for (const key of [...configKey.split('.'), ENTRY_NAME]) {
    node = child(node, key);
    if (node === undefined) return null;
  }
  return { raw: node, configKey };
}

/**
 * Reads an OpenCode entry back as a setup entry. It is recognized only when it
 * is exactly what add-mcp would write for that entry: fields a rewrite would
 * drop (such as `disabled` or a timeout) make it unrecognized, so a rerun
 * confirms before replacing it.
 */
function openCodeEntry(raw: unknown, configKey: string): ServerEntry {
  const parsed = openCodeOnDisk.safeParse(raw);
  const [command, ...args] = parsed.data?.command ?? [];
  if (command === undefined || !parsed.success) return UNRECOGNIZED;
  const entry = { command, args, env: parsed.data.environment };
  const rewritten = agents.opencode.transformConfig(ENTRY_NAME, entry, { local: false, configKey });
  return isDeepStrictEqual(raw, rewritten) ? entry : UNRECOGNIZED;
}

/**
 * The Microsoft Store (MSIX) build of Claude Desktop on Windows reads a
 * virtualized config that add-mcp 2.6.1 does not write (add-mcp issue #50).
 */
function storeClaudeDesktopConfig(): string | undefined {
  const local = process.env.LOCALAPPDATA;
  if (process.platform !== 'win32' || !local) return undefined;
  const packages = join(local, 'Packages');
  let names: string[];
  try {
    names = readdirSync(packages);
  } catch {
    return undefined;
  }
  const name = names.find((n) => n.startsWith('Claude_'));
  return (
    name && join(packages, name, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json')
  );
}

/** {@link Clients} backed by the add-mcp library, in user (global) scope only. */
export function addMcpClients(): Clients {
  const available = new Set(getAgentTypes());
  return {
    async list() {
      const detected = new Set(await detectGlobalAgents());
      const relocated = relocatedOpenCodeDir();
      if (relocated) {
        // add-mcp detects OpenCode by `~/.config/opencode`; OpenCode itself uses this one.
        detected.delete('opencode');
        if (existsSync(relocated)) detected.add('opencode');
      }
      return SUPPORTED_CLIENTS.filter((id) => available.has(id)).map((id) => ({
        id,
        name: agents[id].displayName,
        configPath: configPath(id),
        detected: detected.has(id),
      }));
    },
    async read(id: ClientId) {
      let stored: ReturnType<typeof storedEntry>;
      try {
        stored = storedEntry(id);
      } catch {
        // A file setup cannot read may still hold an entry: confirm before writing.
        return UNRECOGNIZED;
      }
      if (stored === null) return undefined;
      if (id === 'opencode') return openCodeEntry(stored.raw, stored.configKey);
      const parsed = onDisk.safeParse(stored.raw);
      return parsed.success ? parsed.data : UNRECOGNIZED;
    },
    install(id, entry) {
      if (id === 'claude-desktop') {
        const store = storeClaudeDesktopConfig();
        if (store)
          return {
            status: 'manual',
            path: store,
            reason:
              'This is a Microsoft Store install of Claude Desktop, which setup cannot write.',
          };
      }
      if (id === 'opencode' && relocatedOpenCodeDir()) {
        const path = configPath(id);
        let configKey = OPENCODE_LEGACY_KEY;
        try {
          configKey = openCodeKey(readConfig(id));
        } catch {
          // An unreadable file gets the V1 layout, which every OpenCode version reads.
        }
        const server = agents.opencode.transformConfig(ENTRY_NAME, entry, {
          local: false,
          configKey,
        });
        const config = {};
        let node: Record<string, unknown> = config;
        for (const key of configKey.split('.')) node = node[key] = {};
        node[ENTRY_NAME] = server;
        return {
          status: 'manual',
          path,
          reason:
            'XDG_CONFIG_HOME moves the OpenCode configuration, which setup cannot write there.',
          config: JSON.stringify(config, null, 2),
        };
      }
      const result = upsertServer(id, ENTRY_NAME, entry);
      if (!result.success) return { status: 'failed', path: result.path || configPath(id) };
      // The entry carries the password in plain text: keep it readable only by its owner.
      for (const path of [result.path, ...(result.extraPaths ?? [])]) chmodSync(path, 0o600);
      return { status: 'written', path: result.path };
    },
  };
}
