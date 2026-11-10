import { test, onTestFinished } from 'vitest';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { navidromeFixture } from '../support/navidrome.ts';
import { createApp } from '../../src/app.ts';

test('legacy database retains revisions, preview, unknown publication, aliases and recovery across upgrades', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const db = new Database(remote.config.databasePath);
  db.exec(readFileSync(new URL('../support/legacy-schema.sql', import.meta.url), 'utf8'));
  const fingerprint = createHash('sha256')
    .update(`${remote.config.url}\n${remote.config.username}`)
    .digest('hex');
  db.prepare('INSERT INTO identity VALUES (1, ?)').run(fingerprint);
  db.prepare('INSERT INTO drafts VALUES (?, ?, ?)').run('legacy', 2, 1);
  const draft = {
    id: 'legacy',
    revision: 2,
    name: 'Preserved',
    visibility: 'private',
    entries: [{ request: { title: 'Teardrop', artist: 'Massive Attack' }, track: remote.songs[2] }],
    previewed: true,
    locked: true,
  };
  for (const revision of [1, 2])
    db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?)').run(
      'legacy',
      revision,
      JSON.stringify({ ...draft, revision }),
      1,
    );
  const operation = {
    id: 'old-operation',
    draftId: 'legacy',
    revision: 2,
    operationKey: 'original',
    status: 'unknown_outcome',
    phase: 'create',
    recoveryVersion: 1,
    recovery: [
      {
        key: 'old-decision',
        action: 'confirm_not_created',
        at: '2026-01-01T00:00:00.000Z',
        reason: 'Confirmed absent.',
      },
    ],
  };
  db.prepare('INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?)').run(
    operation.id,
    'legacy',
    'original',
    JSON.stringify(operation),
    null,
    0,
  );
  db.prepare('INSERT INTO operation_keys VALUES (?, ?, ?)').run('alias', 'legacy', 2);
  db.close();
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  assert.deepEqual(await service.execute('get_playlist_draft', { draftId: 'legacy' }), {
    status: 'ok',
    data: draft,
  });
  const history = await service.execute('get_playlist_draft', { draftId: 'legacy', revision: 1 });
  assert.equal(history.status, 'ok');
  assert.deepEqual(history.data, { ...draft, revision: 1 });
  assert.deepEqual(
    await service.execute('publish_playlist', {
      draftId: 'legacy',
      revision: 2,
      operationKey: 'new-key',
    }),
    { status: 'ok', data: operation },
  );
  assert.equal(remote.playlists.length, 0);
  const other = await service.execute('save_playlist_draft', { name: 'Other', entries: [] });
  assert.equal(other.status, 'ok');
  const id = (other.data as { id: string }).id;
  assert.equal(
    (await service.execute('publish_playlist', { draftId: id, revision: 1, operationKey: 'alias' }))
      .status,
    'operation_key_conflict',
  );
  // A subsequent startup must leave migrated state and the recorded recovery intact.
  const reopened = createApp(remote.config);
  t.onTestFinished(() => reopened.close());
  assert.deepEqual(await reopened.execute('get_operation', { operationId: operation.id }), {
    status: 'ok',
    data: operation,
  });
});

test('invalid legacy snapshots fail closed through the public tool interface', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const db = new Database(remote.config.databasePath);
  db.exec(readFileSync(new URL('../support/legacy-schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO drafts VALUES (?, ?, ?)').run('invalid', 1, 0);
  db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?)').run('invalid', 1, '{"entries":[]}', 0);
  db.close();
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  assert.equal(
    (await service.execute('get_playlist_draft', { draftId: 'invalid' })).status,
    'internal_error',
  );
});

test.each([
  { playlistId: undefined, status: 'unknown_outcome' },
  { playlistId: 'known-playlist', status: 'incomplete' },
])(
  'legacy expired lease becomes $status without losing publication identity',
  async ({ playlistId, status }) => {
    const remote = await navidromeFixture();
    onTestFinished(() => remote.close());
    const db = new Database(remote.config.databasePath);
    db.exec(readFileSync(new URL('../support/legacy-schema.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO drafts VALUES (?, ?, ?)').run('leased', 1, 1);
    const operation = {
      id: 'leased-operation',
      draftId: 'leased',
      revision: 1,
      operationKey: 'leased-key',
      status: 'creating',
      phase: playlistId ? 'visibility' : 'create',
      playlistId,
      recoveryVersion: 0,
      recovery: [],
    };
    db.prepare('INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?)').run(
      operation.id,
      'leased',
      operation.operationKey,
      JSON.stringify(operation),
      'old-worker',
      1,
    );
    db.close();
    const service = createApp(remote.config);
    onTestFinished(() => service.close());
    const result = await service.execute('get_operation', { operationId: operation.id });
    assert.deepEqual(result, {
      status: 'ok',
      data: {
        ...JSON.parse(JSON.stringify(operation)),
        status,
        details: { reason: 'worker_lease_expired' },
      },
    });
    assert.equal(remote.playlists.length, 0);
  },
);
