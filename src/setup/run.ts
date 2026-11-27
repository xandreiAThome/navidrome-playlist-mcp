import { audioMuseStep } from './audiomuse.ts';
import { clientStep } from './clients.ts';
import type { Clients } from './clients.ts';
import { serverEntry } from './entry.ts';
import type { ServerEntry } from './entry.ts';
import { navidromeStep } from './navidrome.ts';
import type { Prompts } from './prompts.ts';

export type SetupOptions = {
  prompts: Prompts;
  /** The MCP clients the entry can be installed into. */
  clients: Clients;
  /** Package version pinned in the installed entry. */
  version: string;
  /** Bound for each verification request. */
  timeoutMs?: number;
};

/**
 * Runs the setup steps in order. Each step verifies its own settings before
 * returning them, so the resulting entry only carries working configuration.
 */
export async function runSetup({
  prompts,
  clients,
  version,
  timeoutMs = 15000,
}: SetupOptions): Promise<ServerEntry> {
  const navidrome = await navidromeStep(prompts, timeoutMs);
  const audiomuse = await audioMuseStep(prompts, navidrome.url, timeoutMs);
  const entry = serverEntry(version, {
    NAVIDROME_URL: navidrome.url,
    NAVIDROME_USERNAME: navidrome.username,
    NAVIDROME_PASSWORD: navidrome.password,
    ...(audiomuse && {
      AUDIOMUSE_URL: audiomuse.url,
      AUDIOMUSE_API_TOKEN: audiomuse.token,
      AUDIOMUSE_SERVER: audiomuse.server,
    }),
  });
  await clientStep(prompts, clients, entry);
  return entry;
}
