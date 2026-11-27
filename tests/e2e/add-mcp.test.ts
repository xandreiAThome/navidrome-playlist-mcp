import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const adapter = new URL('../../dist/setup/add-mcp.js', import.meta.url).href;

/**
 * add-mcp resolves client paths when it is first imported, so the real adapter
 * runs in a child process whose home directory is a temporary one.
 */
const driver = `
const { addMcpClients } = await import(${JSON.stringify(adapter)});
const clients = addMcpClients();
const entry = (env) => ({ command: 'npx', args: ['-y', 'pkg@1.2.3'], env });
const result = {};
result.list = await clients.list();
result.before = (await clients.read('cursor')) ?? null;
result.first = clients.install('claude-code', entry({ A: 'one', STALE: 'gone' }));
result.second = clients.install('claude-code', entry({ A: 'two' }));
result.cursor = clients.install('cursor', entry({ A: 'one' }));
result.after = await clients.read('claude-code');
process.stdout.write(JSON.stringify(result));
`;

test('the add-mcp adapter installs a user-scope entry, keeps other servers, and makes the file private', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'navidrome-setup-home-'));
  t.onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, '.claude'));
  const claudeJson = join(home, '.claude.json');
  writeFileSync(
    claudeJson,
    JSON.stringify({ numStartups: 3, mcpServers: { other: { command: 'other' } } }),
    { mode: 0o644 },
  );

  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', driver],
    {
      env: {
        PATH: process.env.PATH ?? '',
        HOME: home,
        USERPROFILE: home,
        APPDATA: join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: join(home, '.config'),
      },
      timeout: 10000,
    },
  );
  const result = JSON.parse(stdout) as {
    list: { id: string; detected: boolean; configPath: string }[];
    before: unknown;
    first: { status: string; path: string };
    second: { status: string; path: string };
    cursor: { status: string; path: string };
    after: unknown;
  };

  assert.deepEqual(
    result.list.map((c) => c.id),
    [
      'claude-code',
      'claude-desktop',
      'vscode',
      'cursor',
      'codex',
      'gemini-cli',
      'github-copilot-cli',
      'windsurf',
    ],
  );
  assert.deepEqual(
    result.list.filter((c) => c.detected).map((c) => c.id),
    ['claude-code'],
  );
  assert.equal(result.list[0]?.configPath, claudeJson);
  assert.equal(result.before, null);
  assert.deepEqual(result.second, { status: 'written', path: claudeJson });
  assert.deepEqual(result.after, {
    command: 'npx',
    args: ['-y', 'pkg@1.2.3'],
    env: { A: 'two' },
  });
  const written = JSON.parse(readFileSync(claudeJson, 'utf8')) as Record<string, unknown>;
  assert.equal(written.numStartups, 3);
  assert.deepEqual(Object.keys(written.mcpServers as object).sort(), ['navidrome', 'other']);
  assert.equal(result.cursor.path, join(home, '.cursor', 'mcp.json'));
  if (process.platform !== 'win32')
    for (const file of [claudeJson, result.cursor.path])
      assert.equal(statSync(file).mode & 0o777, 0o600, file);
});

const readDriver = `
const { addMcpClients } = await import(${JSON.stringify(adapter)});
const clients = addMcpClients();
const list = await clients.list();
const result = { detected: list.filter((c) => c.detected).map((c) => c.id) };
for (const id of ['claude-code', 'vscode', 'codex', 'cursor'])
  result[id] = (await clients.read(id)) ?? null;
process.stdout.write(JSON.stringify(result));
`;

test('the add-mcp adapter reads an existing entry whether or not the client is detected', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'navidrome-setup-home-'));
  t.onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  // No ~/.claude directory: add-mcp does not detect Claude Code, yet its file has an entry.
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({
      mcpServers: { navidrome: { command: 'npx', args: ['old'], env: { A: '1' } } },
    }),
  );
  const vscode = join(home, '.config', 'Code', 'User');
  mkdirSync(vscode, { recursive: true });
  writeFileSync(
    join(vscode, 'mcp.json'),
    '{\n  // a comment\n  "servers": { "navidrome": { "command": "npx", "args": ["vs"] } }\n}\n',
  );
  mkdirSync(join(home, '.codex'));
  writeFileSync(
    join(home, '.codex', 'config.toml'),
    '[mcp_servers.navidrome]\ncommand = "npx"\nargs = ["codex"]\n\n[mcp_servers.navidrome.env]\nB = "2"\n',
  );

  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', readDriver],
    {
      env: {
        PATH: process.env.PATH ?? '',
        HOME: home,
        USERPROFILE: home,
        APPDATA: join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: join(home, '.config'),
      },
      timeout: 10000,
    },
  );
  const result = JSON.parse(stdout) as Record<string, unknown>;

  assert.ok(!(result.detected as string[]).includes('claude-code'));
  assert.deepEqual(result['claude-code'], { command: 'npx', args: ['old'], env: { A: '1' } });
  assert.deepEqual(result.vscode, { command: 'npx', args: ['vs'], env: {} });
  assert.deepEqual(result.codex, { command: 'npx', args: ['codex'], env: { B: '2' } });
  assert.equal(result.cursor, null);
});
