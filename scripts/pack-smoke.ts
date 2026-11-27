// Packaging smoke test: pack the built package, install the tarball in a clean
// directory, start the installed binary, and complete the MCP `initialize`
// handshake over stdio. Run after `pnpm build` with `node scripts/pack-smoke.ts`.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const windows = process.platform === 'win32';
const repo = fileURLToPath(new URL('..', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'navidrome-pack-smoke-'));
const timeoutMs = 120_000;

// Windows needs a shell to run npm.cmd and bin shims; quote arguments for it.
const commandLine = (command: string, args: string[]) =>
  windows ? [command, ...args].map((part) => `"${part}"`).join(' ') : command;

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(commandLine(command, args), windows ? [] : args, {
    cwd,
    encoding: 'utf8',
    shell: windows,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function pack(): string {
  const output: unknown = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', root], repo),
  );
  const [packed] = Array.isArray(output) ? output : [];
  if (typeof packed?.filename !== 'string' || !Array.isArray(packed.files))
    throw new Error('npm pack did not report a tarball');
  if (!packed.files.some((file: { path?: unknown }) => file.path === 'dist/cli.js'))
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

async function initialize(project: string): Promise<unknown> {
  const bin = join(
    project,
    'node_modules',
    '.bin',
    `navidrome-playlist-mcp${windows ? '.cmd' : ''}`,
  );
  const child = spawn(commandLine(bin, []), [], {
    cwd: project,
    shell: windows,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NAVIDROME_URL: 'http://127.0.0.1:9',
      NAVIDROME_USERNAME: 'smoke',
      NAVIDROME_PASSWORD: 'smoke-password',
      NAVIDROME_DB_PATH: join(root, 'data', 'playlists.sqlite'),
    },
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('initialize timed out')), timeoutMs);
      let buffer = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const message = JSON.parse(buffer.slice(0, newline)) as { id?: unknown };
          buffer = buffer.slice(newline + 1);
          if (message.id === 1) {
            clearTimeout(timer);
            resolve(message);
          }
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited with ${code} before initializing:\n${stderr}`));
      });
      child.stdin.write(
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
    child.stdin.end();
    const timer = setTimeout(() => {
      if (windows && child.pid) run('taskkill', ['/pid', String(child.pid), '/T', '/F'], root);
      else child.kill('SIGKILL');
    }, 5_000);
    await exited;
    clearTimeout(timer);
  }
}

try {
  const response = (await initialize(install(pack()))) as {
    result?: { protocolVersion?: unknown; serverInfo?: { name?: unknown } };
  };
  if (typeof response.result?.protocolVersion !== 'string' || !response.result.serverInfo?.name)
    throw new Error(`unexpected initialize response: ${JSON.stringify(response)}`);
  process.stdout.write(
    `Pack smoke test passed: ${String(response.result.serverInfo.name)} ` +
      `initialized with protocol ${response.result.protocolVersion}\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
