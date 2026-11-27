import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

test('the setup subcommand is routed to setup instead of starting the stdio server', async () => {
  const failure = await promisify(execFile)(
    process.execPath,
    [cli, 'setup', '--password=hunter2'],
    {
      env: {},
      timeout: 10000,
    },
  ).then(
    () => assert.fail('setup accepted an unknown argument'),
    (error: { code: number; stdout: string; stderr: string }) => error,
  );
  assert.equal(failure.code, 2);
  assert.equal(failure.stderr, 'setup does not accept arguments; run it without options.\n');
  assert.equal(`${failure.stdout}${failure.stderr}`.includes('hunter2'), false);
});
