import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { navidromeFixture } from '../support/navidrome.ts';
import { setTimeout as delay } from 'node:timers/promises';

test('a local MCP client discovers tools and completes a previewed playlist workflow over stdio', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../dist/cli.js', import.meta.url))],
    env: {
      NAVIDROME_URL: remote.config.url,
      NAVIDROME_USERNAME: 'tester',
      NAVIDROME_PASSWORD: 'secret-password',
      NAVIDROME_DB_PATH: remote.config.databasePath,
    },
    stderr: 'pipe',
  });
  let diagnostics = '';
  transport.stderr?.on('data', (chunk) => {
    diagnostics += String(chunk);
  });
  const client = new Client({ name: 'playlist-test', version: '1.0.0' });
  t.onTestFinished(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      'check_connection',
      'search_tracks',
      'resolve_tracks',
      'list_playlists',
      'get_playlist',
      'save_playlist_draft',
      'get_playlist_draft',
      'copy_playlist_draft',
      'preview_playlist',
      'publish_playlist',
      'get_operation',
      'reconcile_operation',
    ].sort(),
  );
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, false, JSON.stringify(response));
    return response.structuredContent as { status: string; data: Record<string, unknown> };
  };
  assert.equal((await call('check_connection', {})).data.connected, true);
  const draft = (
    await call('save_playlist_draft', {
      name: 'From MCP',
      entries: [{ request: { title: 'Teardrop', artist: 'Massive Attack' } }],
    })
  ).data;
  await call('preview_playlist', { draftId: draft.id, revision: 1 });
  const operation = (
    await call('publish_playlist', { draftId: draft.id, revision: 1, operationKey: 'mcp' })
  ).data;
  assert.equal(operation.status, 'succeeded');
  assert.equal(remote.playlists[0]?.public, true);
  const invalid = await client.callTool({
    name: 'save_playlist_draft',
    arguments: { password: 'never-accept-this' },
  });
  assert.equal(invalid.isError, true);
  assert.equal(diagnostics.includes('secret-password'), false);
});

test('separate MCP processes serialize publication and recover conservatively after a worker is killed', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const connect = async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../../dist/cli.js', import.meta.url))],
      env: {
        NAVIDROME_URL: remote.config.url,
        NAVIDROME_USERNAME: 'tester',
        NAVIDROME_PASSWORD: 'secret-password',
        NAVIDROME_DB_PATH: remote.config.databasePath,
        NAVIDROME_TIMEOUT_MS: '1000',
      },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'concurrent-test', version: '1.0.0' });
    t.onTestFinished(() => client.close());
    await client.connect(transport);
    return { client, transport };
  };
  const first = await connect();
  const second = await connect();
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, false, JSON.stringify(response));
    return (response.structuredContent as { data: Record<string, unknown> }).data;
  };
  const makeDraft = async () => {
    const draft = await call(first.client, 'save_playlist_draft', {
      name: 'Concurrent',
      entries: [{ request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' }],
    });
    await call(first.client, 'preview_playlist', { draftId: draft.id, revision: 1 });
    return draft;
  };
  remote.controls.delayCreateMs = 150;
  const draft = await makeDraft();
  const operations = await Promise.all(
    [first.client, second.client].map((client, index) =>
      call(client, 'publish_playlist', {
        draftId: draft.id,
        revision: 1,
        operationKey: `process-${index}`,
      }),
    ),
  );
  assert.equal(operations[0]!.id, operations[1]!.id);
  assert.equal(remote.playlists.length, 1);

  const uncertain = await makeDraft();
  remote.controls.delayCreateMs = 400;
  const pending = first.client
    .callTool({
      name: 'publish_playlist',
      arguments: {
        draftId: uncertain.id,
        revision: 1,
        operationKey: 'killed-worker',
      },
    })
    .catch(() => undefined);
  const deadline = Date.now() + 3000;
  while (remote.controls.creationRequests < 2 && Date.now() < deadline) await delay(10);
  assert.equal(remote.controls.creationRequests, 2);
  process.kill(first.transport.pid!, 'SIGKILL');
  await pending;
  const blocked = await call(second.client, 'publish_playlist', {
    draftId: uncertain.id,
    revision: 1,
    operationKey: 'after-crash',
  });
  assert.equal(blocked.status, 'creating');
  assert.equal(
    (
      await second.client.callTool({
        name: 'reconcile_operation',
        arguments: {
          operationId: blocked.id,
          action: 'confirm_not_created',
          reason: 'Too early',
          recoveryKey: 'premature',
          expectedRecoveryVersion: 0,
        },
      })
    ).isError,
    true,
  );
  // The persisted lease is 3 * request timeout + 10 seconds. Crash recovery must
  // wait for it rather than treating another live process as a dead worker.
  await delay(13100);
  const unknown = await call(second.client, 'get_operation', { operationId: blocked.id });
  assert.equal(unknown.status, 'unknown_outcome');
  assert.equal(remote.playlists.length, 2);
  const adopted = await call(second.client, 'reconcile_operation', {
    operationId: blocked.id,
    action: 'adopt',
    playlistId: 'p2',
    reason: 'Operator identified the interrupted creation.',
    recoveryKey: 'adopt-crash',
    expectedRecoveryVersion: 0,
  });
  assert.equal(adopted.status, 'succeeded');
  assert.equal(remote.playlists.length, 2);
});
