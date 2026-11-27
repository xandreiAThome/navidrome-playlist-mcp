// Packaging smoke test: pack the built package, install the tarball in a clean
// directory, start the installed binary without NAVIDROME_DB_PATH, complete the
// MCP `initialize` handshake over stdio, and check that the default per-user
// database was created. The per-user base directory is redirected into a temp
// directory, so the real user's data directory is never touched. Run after
// `pnpm build` with `node scripts/pack-smoke.ts`.
import { execFileSync, spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const windows = process.platform === 'win32';
const repo = fileURLToPath(new URL('..', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'navidrome-pack-smoke-'));
const timeoutMs = 120_000;

// Windows needs a shell to run npm.cmd and bin shims, so the quoted command line
// goes to the shell; elsewhere the command and arguments are passed directly.
function platformCommand(command: string, args: string[]) {
  return windows
    ? {
        file: [command, ...args].map((part) => `"${part}"`).join(' '),
        args: [],
        shell: true,
      }
    : { file: command, args, shell: false };
}

function run(command: string, args: string[], cwd: string): string {
  const { file, args: argv, shell } = platformCommand(command, args);
  return execFileSync(file, argv, {
    cwd,
    encoding: 'utf8',
    shell,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function start(command: string, options: SpawnOptions) {
  const { file, args, shell } = platformCommand(command, []);
  return spawn(file, args, { ...options, shell, stdio: ['pipe', 'pipe', 'pipe'] });
}

const packOutput = z.tuple([
  z.object({
    filename: z.string().min(1),
    files: z.array(z.object({ path: z.string() })),
  }),
]);

const initializeResponse = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  result: z.object({
    protocolVersion: z.string().min(1),
    serverInfo: z.object({ name: z.string().min(1) }),
  }),
});

const responseId = z.object({ id: z.unknown() });

function pack(): string {
  const [packed] = packOutput.parse(
    JSON.parse(run('npm', ['pack', '--json', '--pack-destination', root], repo)),
  );
  if (!packed.files.some((file) => file.path === 'dist/cli.js'))
    throw new Error('The tarball has no dist/cli.js; run pnpm build first.');
  return join(root, packed.filename);
}

function install(tarball: string): string {
  const project = join(root, 'project');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ private: true }));
  run('npm', ['install', '--no-audit', '--no-fund', tarball], project);
  return project;
}

// Point the platform's per-user data base (as read by src/config.ts) at a temp
// directory and return where the default database is expected to appear.
function defaultDataLocation(): { env: NodeJS.ProcessEnv; database: string } {
  const base = join(root, 'user-data');
  const database = (dir: string) => join(dir, 'navidrome-playlist-mcp', 'playlists.sqlite');
  if (windows) return { env: { LOCALAPPDATA: base }, database: database(base) };
  if (process.platform === 'darwin')
    return {
      env: { HOME: base },
      database: database(join(base, 'Library', 'Application Support')),
    };
  return { env: { XDG_DATA_HOME: base }, database: database(base) };
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined; // Non-JSON output is ignored; a missing response times out.
  }
}

async function initialize(project: string, dataEnv: NodeJS.ProcessEnv): Promise<unknown> {
  const bin = join(
    project,
    'node_modules',
    '.bin',
    `navidrome-playlist-mcp${windows ? '.cmd' : ''}`,
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NAVIDROME_URL: 'http://127.0.0.1:9',
    NAVIDROME_USERNAME: 'smoke',
    NAVIDROME_PASSWORD: 'smoke-password',
    ...dataEnv,
  };
  delete env.NAVIDROME_DB_PATH;
  const child = start(bin, { cwd: project, env });
  let stderr = '';
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const settle = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outcome();
      };
      const timer = setTimeout(
        () => settle(() => reject(new Error(`initialize timed out:\n${stderr}`))),
        timeoutMs,
      );
      let buffer = '';
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const message = parseLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (responseId.safeParse(message).data?.id === 1) settle(() => resolve(message));
        }
      });
      child.once('error', (error) => settle(() => reject(error)));
      child.once('exit', (code) =>
        settle(() =>
          reject(new Error(`server exited with ${code} before initializing:\n${stderr}`)),
        ),
      );
      child.stdin?.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'pack-smoke', version: '1.0.0' },
          },
        })}\n`,
      );
    });
  } finally {
    child.stdin?.end();
    const timer = setTimeout(() => {
      if (windows && child.pid) run('taskkill', ['/pid', String(child.pid), '/T', '/F'], root);
      else child.kill('SIGKILL');
    }, 5_000);
    await exited;
    clearTimeout(timer);
  }
}

try {
  const location = defaultDataLocation();
  const message = await initialize(install(pack()), location.env);
  const parsed = initializeResponse.safeParse(message);
  if (!parsed.success)
    throw new Error(`unexpected initialize response: ${JSON.stringify(message)}`);
  if (!existsSync(location.database))
    throw new Error(`default database was not created at ${location.database}`);
  const { result } = parsed.data;
  process.stdout.write(
    `Pack smoke test passed: ${result.serverInfo.name} initialized with protocol ` +
      `${result.protocolVersion}; default database created at ${location.database}\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
