import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

/** Runs `setup` with the arguments, expecting it to exit with an error. */
async function failingSetup(args: string[]) {
  return promisify(execFile)(process.execPath, [cli, 'setup', ...args], {
    env: {},
    timeout: 10000,
  }).then(
    () => assert.fail('setup succeeded'),
    (error: { code: number; stdout: string; stderr: string }) => error,
  );
}

test('the setup subcommand is routed to setup and refuses a secret passed as a flag', async () => {
  const failure = await failingSetup(['--password=hunter2']);
  assert.equal(failure.code, 2);
  assert.match(failure.stderr, /^Unknown option --password\. .*NAVIDROME_PASSWORD/);
  assert.equal(`${failure.stdout}${failure.stderr}`.includes('hunter2'), false);
});

test('setup --yes fails fast, naming missing values, before contacting anything', async () => {
  const failure = await failingSetup(['--yes', '--url', 'https://music.example.com']);
  assert.equal(failure.code, 2);
  assert.equal(
    failure.stderr,
    '--yes needs every value: missing --username, NAVIDROME_PASSWORD, --client.\n',
  );
  assert.equal(failure.stdout, '');
});
