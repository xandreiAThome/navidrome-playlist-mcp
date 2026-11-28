import { readFileSync } from 'node:fs';
import * as clack from '@clack/prompts';
import { z } from 'zod';
import { addMcpClients } from './install/add-mcp.ts';
import { parseSetupArgs } from './flags.ts';
import { SetupCancelled, SetupFailed, SetupInterrupted } from './prompts/prompts.ts';
import { runSetup } from './run.ts';
import { terminalPrompts } from './prompts/terminal.ts';

/** The running package's own version, pinned into installed entries. */
function ownVersion(): string {
  // src/setup and dist/setup both sit two levels below the package root.
  const manifest = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
  return z.object({ version: z.string().min(1) }).parse(JSON.parse(manifest)).version;
}

/** Entry point for `navidrome-playlist-mcp setup`; returns the exit code. */
export async function main(args: string[]): Promise<number> {
  const flags = parseSetupArgs(args, process.env);
  if ('error' in flags) {
    process.stderr.write(`${flags.error}\n`);
    return 2;
  }
  clack.intro('navidrome-playlist-mcp setup');
  try {
    await runSetup({
      prompts: terminalPrompts,
      clients: addMcpClients(),
      version: ownVersion(),
      flags,
    });
  } catch (error) {
    // Names the clients already written; nothing else in it is user input.
    if (error instanceof SetupInterrupted) {
      clack.cancel(error.message);
      return 1;
    }
    if (error instanceof SetupFailed) {
      clack.cancel(error.message);
      return 1;
    }
    if (error instanceof SetupCancelled) {
      clack.cancel('Setup cancelled; nothing was written.');
      return 1;
    }
    // Never print raw errors: URLs and passwords may occur in them.
    clack.cancel('Setup failed unexpectedly; nothing was written.');
    return 1;
  }
  clack.outro('Restart your MCP client to load the server.');
  return 0;
}
