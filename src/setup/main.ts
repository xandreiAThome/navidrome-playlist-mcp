import { readFileSync } from 'node:fs';
import * as clack from '@clack/prompts';
import { z } from 'zod';
import { SetupCancelled } from './prompts.ts';
import { runSetup } from './run.ts';
import { terminalPrompts } from './terminal.ts';

/** The running package's own version, pinned into installed entries. */
function ownVersion(): string {
  // src/setup and dist/setup both sit two levels below the package root.
  const manifest = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
  return z.object({ version: z.string().min(1) }).parse(JSON.parse(manifest)).version;
}

/** Entry point for `navidrome-playlist-mcp setup`; returns the exit code. */
export async function main(args: string[]): Promise<number> {
  if (args.length) {
    // Do not echo arguments: a mistyped secret must not be printed back.
    process.stderr.write('setup does not accept arguments; run it without options.\n');
    return 2;
  }
  clack.intro('navidrome-playlist-mcp setup');
  try {
    await runSetup({ prompts: terminalPrompts, version: ownVersion() });
  } catch (error) {
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
