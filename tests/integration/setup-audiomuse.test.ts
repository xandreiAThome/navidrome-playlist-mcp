import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { AUDIOMUSE_TOKEN, audioMuseFixture } from '../support/audiomuse.ts';
import { navidromeFixture } from '../support/navidrome.ts';
import { confirm, password, scriptedPrompts, text } from '../support/prompts.ts';
import type { Answer } from '../support/prompts.ts';
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

const OPT_IN = /Set up AudioMuse recommendations\?/;
const AUDIOMUSE_URL = /AudioMuse URL/;
const AUDIOMUSE_TOKEN_PROMPT = /AudioMuse API token/;
const SKIP = /Skip AudioMuse/;

const navidromeAnswers = (): Answer[] => [
  text(/Navidrome URL/, remote.config.url),
  text(/Navidrome username/, 'tester'),
  password(/Navidrome password/, 'secret-password'),
];

async function setup(script: Answer[]) {
  const session = scriptedPrompts([...navidromeAnswers(), ...script]);
  const entry = await runSetup({ prompts: session.prompts, version: '9.8.7', timeoutMs: 1000 });
  assert.deepEqual(session.remaining, [], 'setup asked fewer questions than scripted');
  return { session, env: entry.env };
}

const audiomuseEnv = (env: Record<string, string>) =>
  Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('AUDIOMUSE_')));

test('declining AudioMuse writes no AudioMuse settings', async () => {
  const { session, env } = await setup([confirm(OPT_IN, false)]);
  assert.deepEqual(audiomuseEnv(env), {});
  assert.deepEqual(
    session.events.find((e) => e.kind === 'confirm'),
    { kind: 'confirm', message: 'Set up AudioMuse recommendations?', initial: false },
  );
});

test('the single AudioMuse server for this Navidrome is detected and written', async () => {
  audio.controls.servers = [
    {
      server_id: 'jellyfin',
      name: 'Films',
      server_type: 'jellyfin',
      creds: { url: remote.config.url },
    },
    {
      server_id: 'other',
      name: 'Elsewhere',
      server_type: 'navidrome',
      creds: { url: 'http://elsewhere' },
    },
    {
      server_id: 'home',
      name: 'Home',
      server_type: 'navidrome',
      creds: { url: `${remote.config.url}/` },
    },
  ];
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, ` ${audio.url}/ `),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
  ]);
  assert.deepEqual(audiomuseEnv(env), {
    AUDIOMUSE_URL: audio.url,
    AUDIOMUSE_API_TOKEN: AUDIOMUSE_TOKEN,
    AUDIOMUSE_SERVER: 'home',
  });
  assert.deepEqual(session.messages('success').slice(1), [
    'Connected to AudioMuse v3.7.4 using media server Home.',
  ]);
  assert.deepEqual(session.messages('info'), ['Ask your assistant to calibrate recommendations.']);
});

const select = (message: RegExp, value: string): Answer => ({ kind: 'select', message, value });
const mediaServer = (server_id: string, name: string, url = remote.config.url) => ({
  server_id,
  name,
  server_type: 'navidrome',
  creds: { url },
});

test('several matching AudioMuse servers are offered for the user to choose', async () => {
  audio.controls.servers = [mediaServer('home', 'Home'), mediaServer('backup', 'Backup')];
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, audio.url),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
    select(/AudioMuse media server/, 'backup'),
  ]);
  assert.equal(env.AUDIOMUSE_SERVER, 'backup');
  assert.deepEqual(
    session.events.find((e) => e.kind === 'select'),
    {
      kind: 'select',
      message: 'Which AudioMuse media server is this Navidrome?',
      choices: [
        { value: 'home', label: 'Home', hint: 'home' },
        { value: 'backup', label: 'Backup', hint: 'backup' },
      ],
    },
  );
});

const NO_SERVER = (url: string) =>
  `AudioMuse has no Navidrome media server at ${url}. Add this Navidrome server in AudioMuse, then check again.`;

test('no matching AudioMuse server is explained and the step can be checked again or skipped', async () => {
  audio.controls.servers = [mediaServer('other', 'Elsewhere', 'http://elsewhere')];
  let checks = 0;
  audio.controls.onServers = async () => {
    checks += 1;
  };
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, audio.url),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
    confirm(SKIP, false),
    confirm(SKIP, true),
  ]);
  assert.equal(checks, 2);
  assert.deepEqual(audiomuseEnv(env), {});
  assert.deepEqual(session.messages('error'), [
    NO_SERVER(remote.config.url),
    NO_SERVER(remote.config.url),
  ]);
  assert.deepEqual(session.messages('info'), []);
});

test('a server added in AudioMuse is found when the user checks again', async () => {
  audio.controls.servers = [];
  // The listing is empty on the first check; the server exists by the second.
  audio.controls.onServers = async () => {
    audio.controls.onServers = async () => {
      audio.controls.servers = undefined;
    };
  };
  const { env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, audio.url),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
    confirm(SKIP, false),
  ]);
  assert.equal(env.AUDIOMUSE_SERVER, 'navidrome');
});

const UNSUPPORTED =
  'This adapter supports AudioMuse 3.7.x releases, validated against v3.7.4; the deployment runs v3.8.0.';

test('an unsupported AudioMuse release fails the step with an offer to skip it', async () => {
  audio.controls.version = 'v3.8.0';
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, audio.url),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
    confirm(SKIP, true),
  ]);
  assert.deepEqual(audiomuseEnv(env), {});
  assert.deepEqual(session.messages('error'), [UNSUPPORTED]);
});

test('declining to skip an unsupported release asks for the AudioMuse URL again', async () => {
  audio.controls.version = 'v3.8.0';
  audio.controls.onVersion = async () => {
    audio.controls.onVersion = async () => {
      audio.controls.version = 'v3.7.5';
    };
  };
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, audio.url),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
    confirm(SKIP, false),
    text(AUDIOMUSE_URL, audio.url),
  ]);
  assert.deepEqual(session.messages('error'), [UNSUPPORTED]);
  assert.deepEqual(session.events.filter((e) => e.kind === 'text').at(-1), {
    kind: 'text',
    message: 'AudioMuse URL',
    initial: audio.url,
  });
  assert.equal(env.AUDIOMUSE_SERVER, 'navidrome');
});

test('a rejected token is explained and only the token is asked again', async () => {
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, audio.url),
    password(AUDIOMUSE_TOKEN_PROMPT, 'wrong-token'),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
  ]);
  assert.deepEqual(session.messages('error'), ['AudioMuse rejected the API token.']);
  assert.equal(env.AUDIOMUSE_API_TOKEN, AUDIOMUSE_TOKEN);
  const shown = JSON.stringify(session.events.filter((e) => e.kind !== 'note'));
  assert.equal(shown.includes(AUDIOMUSE_TOKEN) || shown.includes('wrong-token'), false);
});

test('an unreachable AudioMuse is explained and only the URL is asked again', async () => {
  const unreachable = audio.url;
  await audio.close();
  audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  const { session, env } = await setup([
    confirm(OPT_IN, true),
    text(AUDIOMUSE_URL, unreachable),
    password(AUDIOMUSE_TOKEN_PROMPT, AUDIOMUSE_TOKEN),
    text(AUDIOMUSE_URL, audio.url),
  ]);
  assert.deepEqual(session.messages('error'), [
    `Could not reach AudioMuse at ${unreachable}. Check the address and that AudioMuse is running.`,
  ]);
  assert.equal(env.AUDIOMUSE_URL, audio.url);
});
