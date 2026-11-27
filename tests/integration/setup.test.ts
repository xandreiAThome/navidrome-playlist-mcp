import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { navidromeFixture } from '../support/navidrome.ts';
import { password, scriptedPrompts, text } from '../support/prompts.ts';
import type { Answer } from '../support/prompts.ts';
import { runSetup } from '../../src/setup/run.ts';
import { SetupCancelled } from '../../src/setup/prompts.ts';

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

async function setup(script: Answer[]) {
  const session = scriptedPrompts(script);
  await runSetup({ prompts: session.prompts, version: '9.8.7', timeoutMs: 1000 });
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
    runSetup({ prompts: session.prompts, version: '9.8.7', timeoutMs: 1000 }),
    SetupCancelled,
  );
  assert.deepEqual(session.messages('note'), []);
});
