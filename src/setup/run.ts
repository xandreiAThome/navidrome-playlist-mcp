import { audioMuseStep } from './audiomuse.ts';
import { clientStep } from './clients.ts';
import type { Clients } from './clients.ts';
import { serverEntry } from './entry.ts';
import type { ServerEntry } from './entry.ts';
import type { SetupFlags } from './flags.ts';
import { navidromeStep } from './navidrome.ts';
import { unattended } from './prompts.ts';
import type { Prompts } from './prompts.ts';

export type SetupOptions = {
  prompts: Prompts;
  /** The MCP clients the entry can be installed into. */
  clients: Clients;
  /** Package version pinned in the installed entry. */
  version: string;
  /** Bound for each verification request. */
  timeoutMs?: number;
  /** Answers from flags and the environment; with `yes`, nothing is asked. */
  flags?: SetupFlags;
};

/**
 * Runs the setup steps in order. Each step verifies its own settings before
 * returning them, so the resulting entry only carries working configuration.
 * Unattended (`--yes`), a question that flags cannot answer fails setup with
 * SetupFailed before anything is written; existing entries are
 * overwritten without confirmation.
 */
export async function runSetup({
  prompts,
  clients,
  version,
  timeoutMs = 15000,
  flags = { navidrome: {}, yes: false },
}: SetupOptions): Promise<ServerEntry> {
  if (flags.yes) prompts = unattended(prompts);
  const navidrome = await navidromeStep(prompts, timeoutMs, flags.navidrome);
  const audiomuse = await audioMuseStep(
    prompts,
    navidrome.url,
    timeoutMs,
    flags.audiomuse ?? (flags.yes ? false : undefined),
  );
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
  const delivered = await clientStep(prompts, clients, entry, {
    ...(flags.clients && { selection: flags.clients }),
    overwrite: flags.yes,
  });
  // Calibration runs through the installed server, so it is the closing step.
  if (audiomuse && delivered) prompts.log.info('Ask your assistant to calibrate recommendations.');
  return entry;
}
