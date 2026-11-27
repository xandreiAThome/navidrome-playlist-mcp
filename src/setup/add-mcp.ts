import { chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as TOML from '@iarna/toml';
import { agents, detectGlobalAgents, getAgentTypes, upsertServer } from 'add-mcp';
import * as jsonc from 'jsonc-parser';
import type { AgentType } from 'add-mcp';
import { z } from 'zod';
import { SUPPORTED_CLIENTS } from './clients.ts';
import type { ClientId, Clients } from './clients.ts';
import { ENTRY_NAME } from './entry.ts';
import type { ServerEntry } from './entry.ts';

// Compile-time guard: every allowlisted client is an add-mcp agent.
SUPPORTED_CLIENTS satisfies readonly AgentType[];

/** The stdio fields every supported client stores; other fields are ignored. */
const onDisk = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

/** Shown in place of an existing entry setup cannot interpret, forcing a confirm. */
const UNRECOGNIZED: ServerEntry = { command: '(unrecognized entry)', args: [], env: {} };

/**
 * The named server entry in a client's user-scope file, raw as stored, or
 * `null` when the file or entry is absent. add-mcp 2.6.1's `listInstalledServers`
 * reports an undetected client (for example Claude Code with `~/.claude.json` but
 * no `~/.claude/`) as empty without reading its file, so the file is read here
 * with the parsers add-mcp itself uses. Throws when the file cannot be parsed.
 */
function storedEntry(id: ClientId): unknown {
  const agent = agents[id];
  if (!existsSync(agent.configPath)) return null;
  const text = readFileSync(agent.configPath, 'utf8');
  const errors: jsonc.ParseError[] = [];
  const config: unknown =
    agent.format === 'toml'
      ? TOML.parse(text)
      : agent.format === 'json'
        ? jsonc.parse(text, errors)
        : undefined;
  if (config === undefined || errors.length) throw new Error('Unreadable client configuration');
  let node: unknown = config;
  for (const key of [...agent.configKey.split('.'), ENTRY_NAME]) {
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) return null;
    // Checked above to be an object owning `key`; TypeScript cannot index `object`.
    node = (node as Record<string, unknown>)[key];
  }
  return node;
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
      return SUPPORTED_CLIENTS.filter((id) => available.has(id)).map((id) => ({
        id,
        name: agents[id].displayName,
        configPath: agents[id].configPath,
        detected: detected.has(id),
      }));
    },
    async read(id: ClientId) {
      let stored: unknown;
      try {
        stored = storedEntry(id);
      } catch {
        // A file setup cannot read may still hold an entry: confirm before writing.
        return UNRECOGNIZED;
      }
      if (stored === null) return undefined;
      const parsed = onDisk.safeParse(stored);
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
      const result = upsertServer(id, ENTRY_NAME, entry);
      if (!result.success) return { status: 'failed', path: result.path || agents[id].configPath };
      // The entry carries the password in plain text: keep it readable only by its owner.
      for (const path of [result.path, ...(result.extraPaths ?? [])]) chmodSync(path, 0o600);
      return { status: 'written', path: result.path };
    },
  };
}
