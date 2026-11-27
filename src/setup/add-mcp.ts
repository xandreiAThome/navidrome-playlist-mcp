import { chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  agents,
  detectGlobalAgents,
  getAgentTypes,
  listInstalledServers,
  upsertServer,
} from 'add-mcp';
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
      // An undetected client is reported without reading its file, so as empty.
      const [record] = await listInstalledServers({ global: true, agents: [id] });
      const found = record?.servers.find((s) => s.serverName === ENTRY_NAME);
      if (!found) return undefined;
      const parsed = onDisk.safeParse(found.config);
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
