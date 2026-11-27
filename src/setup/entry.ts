export const PACKAGE_NAME = '@xandreiathome/navidrome-playlist-mcp';
export const ENTRY_NAME = 'navidrome';

/** The MCP client server entry setup installs; credentials live only in `env`. */
export type ServerEntry = { command: string; args: string[]; env: Record<string, string> };

export function serverEntry(version: string, env: Record<string, string>): ServerEntry {
  return { command: 'npx', args: ['-y', `${PACKAGE_NAME}@${version}`], env };
}

/** The entry in the common `mcpServers` JSON shape, for copying by hand. */
export function manualConfig(entry: ServerEntry): string {
  return JSON.stringify({ mcpServers: { [ENTRY_NAME]: entry } }, null, 2);
}
