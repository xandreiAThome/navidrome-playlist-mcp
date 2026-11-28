import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { AUDIOMUSE_TOKEN, audioMuseFixture } from '../support/audiomuse.ts';
import { fakeClients } from '../support/clients.ts';
import { navidromeFixture } from '../support/navidrome.ts';
import { password, scriptedPrompts, text } from '../support/prompts.ts';
import type { Answer } from '../support/prompts.ts';
import { parseSetupArgs } from '../../src/setup/flags.ts';
import type { SetupFlags } from '../../src/setup/flags.ts';
import { SetupFailed } from '../../src/setup/prompts.ts';
import { runSetup } from '../../src/setup/run.ts';

let remote: Awaited<ReturnType<typeof navidromeFixture>>;
let audio: Awaited<ReturnType<typeof audioMuseFixture>>;
beforeEach(async () => {
  remote = await navidromeFixture();
  audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
});
afterEach(async () => {
  await remote.close();
  await audio.close();
});

const ENV = { NAVIDROME_PASSWORD: 'secret-password' };

function flags(args: string[], env: Record<string, string | undefined> = ENV): SetupFlags {
  const parsed = parseSetupArgs(args, env);
  if ('error' in parsed) assert.fail(parsed.error);
  return parsed;
}

const unattended = () => [
  '--yes',
  '--url',
  `${remote.config.url}/rest/`,
  '--username',
  'tester',
  '--client',
  'claude-code',
  '--client=cursor',
];

async function setup(setupFlags: SetupFlags, script: Answer[] = [], fake = fakeClients()) {
  const session = scriptedPrompts(script);
  const run = runSetup({
    prompts: session.prompts,
    clients: fake.clients,
    version: '9.8.7',
    timeoutMs: 1000,
    flags: setupFlags,
  });
  return { session, fake, run };
}

const ENTRY = () => ({
  command: 'npx',
  args: ['-y', '@xandreiathome/navidrome-playlist-mcp@9.8.7'],
  env: {
    NAVIDROME_URL: remote.config.url,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret-password',
  },
});

test('--yes installs into the named clients from flags and environment without asking anything', async () => {
  const { session, fake, run } = await setup(flags(unattended()));
  await run;
  assert.deepEqual(
    session.events.filter((e) => !['info', 'success', 'note'].includes(e.kind)),
    [],
  );
  assert.deepEqual(fake.written, [
    { id: 'claude-code', entry: ENTRY() },
    { id: 'cursor', entry: ENTRY() },
  ]);
});

test('--yes overwrites an existing entry after showing the masked diff', async () => {
  const fake = fakeClients({
    entries: { 'claude-code': { ...ENTRY(), env: { ...ENTRY().env, NAVIDROME_PASSWORD: 'old' } } },
  });
  const { session, run } = await setup(flags(unattended()), [], fake);
  await run;
  assert.deepEqual(
    fake.written.map((w) => w.id),
    ['claude-code', 'cursor'],
  );
  assert.equal(session.messages('note').length, 1);
  assert.match(session.messages('note')[0]!, /\+ NAVIDROME_PASSWORD: \*{8} \(changed\)/);
  assert.equal(JSON.stringify(session.events).includes('secret-password'), false);
});

test('--yes stops with an error and writes nothing when the account does not verify', async () => {
  const { session, fake, run } = await setup(
    flags(unattended(), { NAVIDROME_PASSWORD: 'wrong-password' }),
  );
  await assert.rejects(run, SetupFailed);
  assert.deepEqual(session.messages('error'), ['Navidrome rejected the username or password.']);
  assert.deepEqual(fake.written, []);
  assert.deepEqual(session.messages('note'), []);
  assert.equal(JSON.stringify(session.events).includes('wrong-password'), false);
});

test('--yes with --audiomuse-url configures AudioMuse using the token from the environment', async () => {
  const { fake, run } = await setup(
    flags([...unattended(), '--audiomuse-url', audio.url], {
      ...ENV,
      AUDIOMUSE_API_TOKEN: AUDIOMUSE_TOKEN,
    }),
  );
  await run;
  assert.deepEqual(fake.written[0]!.entry.env, {
    ...ENTRY().env,
    AUDIOMUSE_URL: audio.url,
    AUDIOMUSE_API_TOKEN: AUDIOMUSE_TOKEN,
    AUDIOMUSE_SERVER: 'navidrome',
  });
});

test('--yes fails instead of skipping AudioMuse when it does not verify', async () => {
  audio.controls.version = 'v3.6.0';
  const { fake, run } = await setup(
    flags([...unattended(), '--audiomuse-url', audio.url], {
      ...ENV,
      AUDIOMUSE_API_TOKEN: AUDIOMUSE_TOKEN,
    }),
  );
  await assert.rejects(run, SetupFailed);
  assert.deepEqual(fake.written, []);
});

test('--yes fails when several AudioMuse media servers match instead of guessing', async () => {
  const server = (id: string) => ({
    server_id: id,
    name: id,
    server_type: 'navidrome',
    creds: { url: remote.config.url },
  });
  audio.controls.servers = [server('a'), server('b')];
  const { fake, run } = await setup(
    flags([...unattended(), '--audiomuse-url', audio.url], {
      ...ENV,
      AUDIOMUSE_API_TOKEN: AUDIOMUSE_TOKEN,
    }),
  );
  await assert.rejects(run, /Which AudioMuse media server/);
  assert.deepEqual(fake.written, []);
});

test('without --yes, flags answer their questions and the rest are asked', async () => {
  const { session, fake, run } = await setup(
    flags(['--url', remote.config.url, '--client', 'manual'], {}),
    [
      text(/Navidrome username/, 'tester'),
      password(/Navidrome password/, 'secret-password'),
      { kind: 'confirm', message: /AudioMuse/, value: false },
    ],
  );
  await run;
  assert.deepEqual(session.remaining, []);
  assert.equal(
    session.events.some((e) => e.kind === 'multiselect' || e.message === 'Navidrome URL'),
    false,
  );
  assert.deepEqual(fake.written, []);
  assert.equal(session.messages('note').length, 1);
});

test('without --yes, a flag value that fails verification is asked again', async () => {
  const { session, run } = await setup(
    flags(['--username', 'tester', '--client', 'manual'], { NAVIDROME_PASSWORD: 'wrong' }),
    [
      text(/Navidrome URL/, remote.config.url),
      text(/Navidrome username/, 'tester'),
      password(/Navidrome password/, 'secret-password'),
      { kind: 'confirm', message: /AudioMuse/, value: false },
    ],
  );
  await run;
  assert.deepEqual(session.remaining, []);
});

test('--yes requires every value up front, naming what is missing', () => {
  assert.deepEqual(parseSetupArgs(['--yes', '--audiomuse-url', 'http://a.example'], {}), {
    error:
      '--yes needs every value: missing --url, --username, NAVIDROME_PASSWORD, AUDIOMUSE_API_TOKEN, --client.',
  });
});

test('secrets are not accepted as flags and unknown arguments are not echoed', () => {
  for (const args of [['--password=hunter2'], ['--password', 'hunter2'], ['hunter2']]) {
    const parsed = parseSetupArgs(args, {});
    assert.ok('error' in parsed);
    assert.equal(parsed.error.includes('hunter2'), false, parsed.error);
  }
  const parsed = parseSetupArgs(['--password=hunter2'], {});
  assert.ok('error' in parsed);
  assert.match(parsed.error, /--password/);
  assert.match(parsed.error, /NAVIDROME_PASSWORD/);
});

test('an unsupported client or malformed URL is rejected before anything runs', () => {
  assert.deepEqual(parseSetupArgs(['--client', 'emacs'], {}), {
    error:
      '--client accepts claude-code, claude-desktop, vscode, cursor, codex, gemini-cli, github-copilot-cli, windsurf, opencode, manual.',
  });
  assert.deepEqual(parseSetupArgs(['--url', 'music.example.com'], {}), {
    error: '--url: Enter a full URL such as https://music.example.com.',
  });
  assert.deepEqual(
    flags(['--url', 'https://music.example.com/rest/'], {}).navidrome.url,
    'https://music.example.com',
  );
});

test('--audiomuse-url is normalized as an AudioMuse base URL, keeping any /rest path', () => {
  assert.deepEqual(parseSetupArgs(['--audiomuse-url', 'audiomuse.example.com'], {}), {
    error: '--audiomuse-url: Enter a full URL such as http://audiomuse.example.com:8000.',
  });
  assert.equal(
    flags(['--audiomuse-url', 'https://music.example.com/rest/'], {}).audiomuse?.url,
    'https://music.example.com/rest',
  );
});
