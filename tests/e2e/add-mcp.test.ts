import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const adapter = new URL('../../dist/setup/install/add-mcp.js', import.meta.url).href;

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
      'opencode',
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

const clientsModule = new URL('../../dist/setup/steps/clients.js', import.meta.url).href;

/** A child process environment whose home and config directories are under `home`. */
function homeEnv(home: string, overrides: Record<string, string> = {}) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: join(home, '.config'),
    ...overrides,
  };
}

const openCodeDriver = `
const { addMcpClients } = await import(${JSON.stringify(adapter)});
const { entryDiff } = await import(${JSON.stringify(clientsModule)});
const clients = addMcpClients();
const entry = (password) => ({
  command: 'npx',
  args: ['-y', 'pkg@1.2.3'],
  env: { NAVIDROME_USERNAME: 'me', NAVIDROME_PASSWORD: password },
});
const result = {};
result.client = (await clients.list()).find((c) => c.id === 'opencode');
result.before = (await clients.read('opencode')) ?? null;
result.install = clients.install('opencode', entry('first-secret'));
result.after = (await clients.read('opencode')) ?? null;
result.unchanged = entryDiff(result.after, entry('first-secret')) ?? null;
result.changed = entryDiff(result.after, entry('second-secret')) ?? null;
process.stdout.write(JSON.stringify(result));
`;

test('the add-mcp adapter installs into OpenCode and tells an unchanged entry from a changed one', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'navidrome-setup-home-'));
  t.onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, '.config', 'opencode');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'opencode.json');
  writeFileSync(
    file,
    '{\n  // my servers\n  "theme": "dark",\n  "mcp": { "other": { "type": "local", "command": ["other"] } }\n}\n',
    { mode: 0o644 },
  );

  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', openCodeDriver],
    { env: homeEnv(home), timeout: 10000 },
  );
  const result = JSON.parse(stdout) as Record<string, unknown>;

  assert.deepEqual(result.client, {
    id: 'opencode',
    name: 'OpenCode',
    configPath: file,
    detected: true,
  });
  assert.equal(result.before, null);
  assert.deepEqual(result.install, { status: 'written', path: file });
  const text = readFileSync(file, 'utf8');
  assert.match(text, /\/\/ my servers/);
  const written = JSON.parse(text.replace(/\/\/.*$/m, '')) as {
    theme: string;
    mcp: Record<string, unknown>;
  };
  assert.equal(written.theme, 'dark');
  assert.deepEqual(written.mcp.other, { type: 'local', command: ['other'] });
  assert.deepEqual(written.mcp.navidrome, {
    type: 'local',
    command: ['npx', '-y', 'pkg@1.2.3'],
    environment: { NAVIDROME_USERNAME: 'me', NAVIDROME_PASSWORD: 'first-secret' },
    enabled: true,
  });
  assert.deepEqual(result.after, {
    command: 'npx',
    args: ['-y', 'pkg@1.2.3'],
    env: { NAVIDROME_USERNAME: 'me', NAVIDROME_PASSWORD: 'first-secret' },
  });
  assert.equal(result.unchanged, null);
  assert.equal(
    result.changed,
    [
      '  command: npx',
      '  args: -y pkg@1.2.3',
      '  NAVIDROME_USERNAME: me',
      '- NAVIDROME_PASSWORD: ********',
      '+ NAVIDROME_PASSWORD: ******** (changed)',
    ].join('\n'),
  );
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
});

const openCodeReadDriver = `
const { addMcpClients } = await import(${JSON.stringify(adapter)});
process.stdout.write(JSON.stringify((await addMcpClients().read('opencode')) ?? null));
`;

async function readOpenCode(config: object) {
  const home = mkdtempSync(join(tmpdir(), 'navidrome-setup-home-'));
  try {
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.config', 'opencode', 'opencode.jsonc'), JSON.stringify(config));
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '-e', openCodeReadDriver],
      { env: homeEnv(home), timeout: 10000 },
    );
    return JSON.parse(stdout) as unknown;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test('an OpenCode entry is recognized only as add-mcp would write it, in either layout', async () => {
  const local = { type: 'local', command: ['npx', 'pkg'], environment: { A: '1' } };
  const entry = { command: 'npx', args: ['pkg'], env: { A: '1' } };
  const unrecognized = { command: '(unrecognized entry)', args: [], env: {} };

  assert.deepEqual(await readOpenCode({ mcp: { servers: { navidrome: local } } }), entry);
  assert.deepEqual(await readOpenCode({ mcp: { navidrome: { ...local, enabled: true } } }), entry);
  // A rewrite would drop these, so the rerun must show a change and confirm.
  assert.deepEqual(
    await readOpenCode({ mcp: { navidrome: { ...local, enabled: false } } }),
    unrecognized,
  );
  assert.deepEqual(
    await readOpenCode({ mcp: { servers: { navidrome: { ...local, disabled: true } } } }),
    unrecognized,
  );
  assert.equal(await readOpenCode({ mcp: { servers: { other: local } } }), null);
});

const openCodeXdgDriver = `
const { addMcpClients } = await import(${JSON.stringify(adapter)});
const clients = addMcpClients();
const entry = { command: 'npx', args: ['pkg'], env: { NAVIDROME_PASSWORD: 'p' } };
const result = {};
result.client = (await clients.list()).find((c) => c.id === 'opencode');
result.read = (await clients.read('opencode')) ?? null;
result.install = clients.install('opencode', entry);
process.stdout.write(JSON.stringify(result));
`;

test('OpenCode under a relocated XDG config directory falls back to the config to copy', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'navidrome-setup-home-'));
  t.onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const xdg = join(home, 'xdg');
  const file = join(xdg, 'opencode', 'opencode.json');
  mkdirSync(join(xdg, 'opencode'), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({
      mcp: {
        navidrome: { type: 'local', command: ['npx', 'old'], environment: {}, enabled: true },
      },
    }),
  );

  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', openCodeXdgDriver],
    { env: homeEnv(home, { XDG_CONFIG_HOME: xdg }), timeout: 10000 },
  );
  const result = JSON.parse(stdout) as {
    client: { configPath: string; detected: boolean };
    read: unknown;
    install: { status: string; path: string; reason: string; config: string };
  };

  assert.deepEqual(result.client, {
    id: 'opencode',
    name: 'OpenCode',
    configPath: file,
    detected: true,
  });
  assert.deepEqual(result.read, { command: 'npx', args: ['old'], env: {} });
  assert.equal(result.install.status, 'manual');
  assert.equal(result.install.path, file);
  assert.match(result.install.reason, /XDG_CONFIG_HOME/);
  assert.deepEqual(JSON.parse(result.install.config), {
    mcp: {
      navidrome: {
        type: 'local',
        command: ['npx', 'pkg'],
        environment: { NAVIDROME_PASSWORD: 'p' },
        enabled: true,
      },
    },
  });
  assert.equal(existsSync(join(home, '.config', 'opencode')), false);
});
