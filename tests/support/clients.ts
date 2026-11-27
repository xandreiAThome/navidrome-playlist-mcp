import type { ServerEntry } from '../../src/setup/entry.ts';
import type { ClientId, Clients, InstallOutcome } from '../../src/setup/clients.ts';

const NAMES: Record<ClientId, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  vscode: 'VS Code',
  cursor: 'Cursor',
  codex: 'Codex',
  'gemini-cli': 'Gemini CLI',
  'github-copilot-cli': 'GitHub Copilot CLI',
  windsurf: 'Windsurf',
};

/**
 * In-memory MCP clients: `detected` are reported as installed, `entries` holds
 * each client's current `navidrome` entry, and `outcomes` overrides what an
 * install reports for a client (a manual-copy fallback or a failure).
 */
export function fakeClients({
  detected = [],
  entries = {},
  outcomes = {},
}: {
  detected?: ClientId[];
  entries?: Partial<Record<ClientId, ServerEntry>>;
  outcomes?: Partial<Record<ClientId, InstallOutcome>>;
} = {}) {
  const written: { id: ClientId; entry: ServerEntry }[] = [];
  const clients: Clients = {
    async list() {
      return (Object.keys(NAMES) as ClientId[]).map((id) => ({
        id,
        name: NAMES[id],
        configPath: `/home/tester/${id}.json`,
        detected: detected.includes(id),
      }));
    },
    async read(id) {
      return entries[id];
    },
    install(id, entry) {
      const outcome = outcomes[id];
      if (outcome) return outcome;
      written.push({ id, entry });
      entries[id] = entry;
      return { status: 'written', path: `/home/tester/${id}.json` };
    },
  };
  return { clients, written };
}
