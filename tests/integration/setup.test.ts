import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { navidromeFixture } from '../support/navidrome.ts';
import { fakeClients } from '../support/clients.ts';
import { confirm, multiselect, password, scriptedPrompts, text } from '../support/prompts.ts';
import type { Answer, Event } from '../support/prompts.ts';
import type { Choice } from '../../src/setup/prompts.ts';
import { runSetup } from '../../src/setup/run.ts';
import { SetupCancelled, SetupInterrupted } from '../../src/setup/prompts.ts';

let remote: Awaited<ReturnType<typeof navidromeFixture>>;
beforeEach(async () => {
  remote = await navidromeFixture();
  remote.controls.serverType = 'navidrome';
  remote.controls.serverVersion = '0.58.0 (fa2c8a6b)';
});
afterEach(() => remote.close());

const URL_PROMPT = /Navidrome URL/;
const USERNAME_PROMPT = /username/i;
const PASSWORD_PROMPT = /password/i;
const DECLINE_AUDIOMUSE = confirm(/AudioMuse/, false);

const CLIENTS_PROMPT = /install/i;
const MANUAL = 'manual';

/** Runs setup; unless client answers are given, the user picks the manual copy. */
async function setup(
  script: Answer[],
  clientScript: Answer[] = [multiselect(CLIENTS_PROMPT, [MANUAL])],
  clients = fakeClients().clients,
) {
  const session = scriptedPrompts([...script, ...clientScript]);
  await runSetup({ prompts: session.prompts, clients, version: '9.8.7', timeoutMs: 1000 });
  assert.deepEqual(session.remaining, [], 'setup asked fewer questions than scripted');
  return session;
}

function manualConfig(session: ReturnType<typeof scriptedPrompts>) {
  const notes = session.messages('note');
  assert.equal(notes.length, 1);
  return JSON.parse(notes[0]!) as {
    mcpServers: { navidrome: { command: string; args: string[]; env: Record<string, string> } };
  };
}

test('a verified Navidrome account ends with a pinned manual config using the normalized URL', async () => {
  const session = await setup([
    text(URL_PROMPT, ` ${remote.config.url}/rest/ `),
    text(USERNAME_PROMPT, 'tester'),
    password(PASSWORD_PROMPT, 'secret-password'),
    DECLINE_AUDIOMUSE,
  ]);

  assert.deepEqual(session.messages('success'), [
    'Connected to Navidrome 0.58.0 (fa2c8a6b) as tester.',
  ]);
  assert.deepEqual(manualConfig(session), {
    mcpServers: {
      navidrome: {
        command: 'npx',
        args: ['-y', '@xandreiathome/navidrome-playlist-mcp@9.8.7'],
        env: {
          NAVIDROME_URL: remote.config.url,
          NAVIDROME_USERNAME: 'tester',
          NAVIDROME_PASSWORD: 'secret-password',
        },
      },
    },
  });
});

test('a URL that cannot be a Navidrome base URL is explained and asked again', async () => {
  const session = await setup([
    text(URL_PROMPT, 'music.example.com'),
    text(URL_PROMPT, 'ftp://music.example.com'),
    text(URL_PROMPT, 'http://tester:secret@127.0.0.1'),
    text(URL_PROMPT, `${remote.config.url}?x=1`),
    text(URL_PROMPT, remote.config.url),
    text(USERNAME_PROMPT, 'tester'),
    password(PASSWORD_PROMPT, 'secret-password'),
    DECLINE_AUDIOMUSE,
  ]);
  assert.deepEqual(
    session.events.flatMap((e) => (e.kind === 'invalid' ? [e.error] : [])),
    [
      'Enter a full URL such as https://music.example.com.',
      'Use an http:// or https:// URL.',
      'Leave credentials out of the URL; setup asks for them next.',
      'Remove the query string or fragment.',
    ],
  );
  assert.equal(manualConfig(session).mcpServers.navidrome.env.NAVIDROME_URL, remote.config.url);
});

async function closedPortUrl() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

test('an unreachable server is explained and only the URL is asked again', async () => {
  const unreachable = await closedPortUrl();
  const session = await setup([
    text(URL_PROMPT, unreachable),
    text(USERNAME_PROMPT, 'tester'),
    password(PASSWORD_PROMPT, 'secret-password'),
    text(URL_PROMPT, remote.config.url),
    DECLINE_AUDIOMUSE,
  ]);
  assert.deepEqual(session.messages('error'), [
    `Could not reach a Navidrome server at ${unreachable}. Check the address and that the server is running.`,
  ]);
  assert.deepEqual(session.events.filter((e) => e.kind === 'text').at(-1), {
    kind: 'text',
    message: 'Navidrome URL',
    initial: unreachable,
  });
  assert.equal(manualConfig(session).mcpServers.navidrome.env.NAVIDROME_URL, remote.config.url);
});

test('rejected credentials are explained and asked again, keeping the URL', async () => {
  const session = await setup([
    text(URL_PROMPT, remote.config.url),
    text(USERNAME_PROMPT, 'tester'),
    password(PASSWORD_PROMPT, 'wrong-password'),
    text(USERNAME_PROMPT, 'tester'),
    password(PASSWORD_PROMPT, 'secret-password'),
    DECLINE_AUDIOMUSE,
  ]);
  assert.deepEqual(session.messages('error'), ['Navidrome rejected the username or password.']);
  assert.deepEqual(session.events.filter((e) => e.kind === 'text').at(-1), {
    kind: 'text',
    message: 'Navidrome username',
    initial: 'tester',
  });
  assert.equal(
    manualConfig(session).mcpServers.navidrome.env.NAVIDROME_PASSWORD,
    'secret-password',
  );
  const shown = JSON.stringify(session.events.filter((e) => e.kind !== 'note'));
  assert.equal(shown.includes('secret-password') || shown.includes('wrong-password'), false);
});

test('setup cancelled before the account verifies never prints a configuration', async () => {
  const session = scriptedPrompts([
    text(URL_PROMPT, remote.config.url),
    text(USERNAME_PROMPT, 'tester'),
    password(PASSWORD_PROMPT, 'wrong-password'),
  ]);
  await assert.rejects(
    runSetup({
      prompts: session.prompts,
      clients: fakeClients().clients,
      version: '9.8.7',
      timeoutMs: 1000,
    }),
    SetupCancelled,
  );
  assert.deepEqual(session.messages('note'), []);
});

const ACCOUNT = () => [
  text(URL_PROMPT, remote.config.url),
  text(USERNAME_PROMPT, 'tester'),
  password(PASSWORD_PROMPT, 'secret-password'),
  DECLINE_AUDIOMUSE,
];
const ENTRY = () => ({
  command: 'npx',
  args: ['-y', '@xandreiathome/navidrome-playlist-mcp@9.8.7'],
  env: {
    NAVIDROME_URL: remote.config.url,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret-password',
  },
});

test('detected clients are listed first and preselected, with the manual copy last', async () => {
  const fake = fakeClients({ detected: ['cursor', 'claude-code'] });
  const session = await setup(
    ACCOUNT(),
    [multiselect(CLIENTS_PROMPT, ['claude-code', 'cursor'])],
    fake.clients,
  );

  const asked = session.events.find(
    (e): e is Event & { kind: 'multiselect'; choices?: Choice<unknown>[]; initial?: unknown } =>
      e.kind === 'multiselect',
  );
  assert.deepEqual(
    asked?.choices?.map((c) => c.value),
    [
      'claude-code',
      'cursor',
      'claude-desktop',
      'vscode',
      'codex',
      'gemini-cli',
      'github-copilot-cli',
      'windsurf',
      MANUAL,
    ],
  );
  assert.deepEqual(asked?.initial, ['claude-code', 'cursor']);
  assert.deepEqual(fake.written, [
    { id: 'claude-code', entry: ENTRY() },
    { id: 'cursor', entry: ENTRY() },
  ]);
  assert.deepEqual(session.messages('success').slice(1), [
    'Installed into Claude Code (/home/tester/claude-code.json).',
    'Installed into Cursor (/home/tester/cursor.json).',
  ]);
  assert.deepEqual(session.messages('note'), []);
});

test('a client that cannot be written falls back to the config to copy, naming where it goes', async () => {
  const store = 'C:/Users/tester/AppData/Local/Packages/Claude_x/claude_desktop_config.json';
  const fake = fakeClients({
    outcomes: {
      'claude-desktop': {
        status: 'manual',
        path: store,
        reason: 'This is a Microsoft Store install of Claude Desktop.',
      },
      cursor: { status: 'failed', path: '/home/tester/cursor.json' },
    },
  });
  const session = await setup(
    ACCOUNT(),
    [multiselect(CLIENTS_PROMPT, ['claude-desktop', 'cursor', 'codex'])],
    fake.clients,
  );

  assert.deepEqual(fake.written, [{ id: 'codex', entry: ENTRY() }]);
  assert.deepEqual(session.messages('warn'), [
    `This is a Microsoft Store install of Claude Desktop. Copy the config below into ${store}.`,
  ]);
  assert.deepEqual(session.messages('error'), [
    'Could not write the Cursor configuration (/home/tester/cursor.json). Copy the config below instead.',
  ]);
  assert.deepEqual(manualConfig(session).mcpServers.navidrome, ENTRY());
});

const OLD_ENTRY = () => ({
  command: 'npx',
  args: ['-y', '@xandreiathome/navidrome-playlist-mcp@0.1.0'],
  env: {
    NAVIDROME_URL: remote.config.url,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'old-password',
    AUDIOMUSE_API_TOKEN: 'old-token',
  },
});

test('rerunning shows what changes in an existing entry, secrets masked, and overwrites on confirmation', async () => {
  const fake = fakeClients({ detected: ['claude-code'], entries: { 'claude-code': OLD_ENTRY() } });
  const session = await setup(
    ACCOUNT(),
    [multiselect(CLIENTS_PROMPT, ['claude-code']), confirm(/Overwrite/, true)],
    fake.clients,
  );

  assert.deepEqual(
    session.events.filter((e) => e.kind === 'note'),
    [
      {
        kind: 'note',
        title: 'Changes to the navidrome server in Claude Code',
        message: [
          '  command: npx',
          '- args: -y @xandreiathome/navidrome-playlist-mcp@0.1.0',
          '+ args: -y @xandreiathome/navidrome-playlist-mcp@9.8.7',
          `  NAVIDROME_URL: ${remote.config.url}`,
          '  NAVIDROME_USERNAME: tester',
          '- NAVIDROME_PASSWORD: ********',
          '+ NAVIDROME_PASSWORD: ******** (changed)',
          '- AUDIOMUSE_API_TOKEN: ********',
        ].join('\n'),
      },
    ],
  );
  assert.deepEqual(session.events.filter((e) => e.kind === 'confirm').at(-1), {
    kind: 'confirm',
    message: 'Overwrite the navidrome server in Claude Code?',
    initial: false,
  });
  assert.deepEqual(fake.written, [{ id: 'claude-code', entry: ENTRY() }]);
  const shown = JSON.stringify(session.events);
  for (const secret of ['secret-password', 'old-password', 'old-token'])
    assert.equal(shown.includes(secret), false, secret);
});

test('declining the overwrite leaves that client unchanged and still installs the others', async () => {
  const fake = fakeClients({ entries: { 'claude-code': OLD_ENTRY() } });
  const session = await setup(
    ACCOUNT(),
    [multiselect(CLIENTS_PROMPT, ['claude-code', 'cursor']), confirm(/Overwrite/, false)],
    fake.clients,
  );
  assert.deepEqual(fake.written, [{ id: 'cursor', entry: ENTRY() }]);
  assert.deepEqual(session.messages('info'), ['Left Claude Code unchanged.']);
});

test('cancelling after some clients were written reports what was written', async () => {
  const fake = fakeClients({ entries: { cursor: OLD_ENTRY() } });
  const session = scriptedPrompts([
    ...ACCOUNT(),
    multiselect(CLIENTS_PROMPT, ['claude-code', 'cursor']),
    // No answer to the Cursor overwrite: the user cancels there.
  ]);
  await assert.rejects(
    runSetup({
      prompts: session.prompts,
      clients: fake.clients,
      version: '9.8.7',
      timeoutMs: 1000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SetupInterrupted);
      assert.ok(error.cause instanceof SetupCancelled);
      assert.equal(
        error.message,
        'Setup cancelled after installing into Claude Code (/home/tester/claude-code.json); nothing else was written.',
      );
      return true;
    },
  );
  assert.deepEqual(fake.written, [{ id: 'claude-code', entry: ENTRY() }]);
});

test('an entry that already matches is not rewritten or confirmed', async () => {
  const fake = fakeClients({ entries: { cursor: ENTRY() } });
  const session = await setup(ACCOUNT(), [multiselect(CLIENTS_PROMPT, ['cursor'])], fake.clients);
  assert.deepEqual(fake.written, []);
  assert.deepEqual(session.messages('info'), ['Cursor is already up to date.']);
});
