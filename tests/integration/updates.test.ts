import { test, expect } from 'vitest';
import { createApp } from '../../src/app.ts';
import { navidromeFixture } from '../support/navidrome.ts';

test('append preserves ordered occurrences and metadata and retries return the recorded operation', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({
    id: 'target',
    name: 'Private',
    public: false,
    entry: [remote.songs[0]!, remote.songs[1]!],
  });
  const app = createApp(remote.config);
  t.onTestFinished(() => app.close());
  const saved = await app.execute('save_playlist_update', {
    playlistId: 'target',
    entries: ['studio', 'other', 'other'].map((trackId) => ({
      request: { title: 'Song', artist: 'Artist' },
      trackId,
    })),
  });
  expect(saved.status).toBe('ok');
  if (saved.status !== 'ok') return;
  const draft = saved.data as { id: string; revision: number };
  await app.execute('preview_playlist_update', { draftId: draft.id, revision: 1 });
  const input = { draftId: draft.id, revision: 1, operationKey: 'append' };
  const applied = await app.execute('apply_playlist_update', input);
  expect(applied.status).toBe('ok');
  expect(applied.data).toMatchObject({ kind: 'update', status: 'succeeded' });
  expect(remote.playlists[0]).toMatchObject({ name: 'Private', public: false });
  expect(remote.playlists[0]!.entry.map((s) => s.id)).toEqual([
    'studio',
    'live',
    'studio',
    'other',
    'other',
  ]);
  expect(await app.execute('apply_playlist_update', input)).toEqual(applied);
  expect(remote.controls.appendRequests).toBe(1);
});

test('target conflicts require refresh and a new preview without locking editable intent', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({
    id: 'target',
    name: 'Original',
    public: true,
    entry: [remote.songs[0]!],
  });
  const app = createApp(remote.config);
  t.onTestFinished(() => app.close());
  const saved = await app.execute('save_playlist_update', { playlistId: 'target', entries: [] });
  expect(saved.status).toBe('ok');
  if (saved.status !== 'ok') return;
  const draft = saved.data as { id: string };
  const ref = { draftId: draft.id, revision: 1 };
  await app.execute('preview_playlist_update', ref);
  remote.playlists[0]!.name = 'Renamed';
  expect(
    (await app.execute('apply_playlist_update', { ...ref, operationKey: 'conflict' })).status,
  ).toBe('target_changed');
  const refreshed = await app.execute('refresh_playlist_update', ref);
  expect(refreshed.status).toBe('ok');
  expect(refreshed.data).toMatchObject({
    draft: { revision: 2, previewed: false, locked: false, name: 'Renamed' },
  });
  expect(
    (await app.execute('apply_playlist_update', { ...ref, revision: 2, operationKey: 'fresh' }))
      .status,
  ).toBe('preview_required');
  await app.execute('preview_playlist_update', { ...ref, revision: 2 });
  expect(
    (await app.execute('apply_playlist_update', { ...ref, revision: 2, operationKey: 'fresh' }))
      .data,
  ).toMatchObject({ status: 'no_changes' });
  expect(remote.controls.appendRequests).toBe(0);
});

test('uncertain appends block other drafts across restart until explicit recovery', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({ id: 'target', name: 'Target', public: false, entry: [] });
  let app = createApp(remote.config);
  t.onTestFinished(() => app.close());
  const entries = [{ request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' }];
  const saved = await app.execute('save_playlist_update', { playlistId: 'target', entries });
  expect(saved.status).toBe('ok');
  if (saved.status !== 'ok') return;
  const draft = saved.data as { id: string };
  const ref = { draftId: draft.id, revision: 1 };
  await app.execute('preview_playlist_update', ref);
  remote.controls.dropAppendResponse = true;
  const applied = await app.execute('apply_playlist_update', { ...ref, operationKey: 'lost' });
  expect(applied.data).toMatchObject({ status: 'unknown_outcome' });
  const operation = applied.data as { id: string };
  app.close();
  app = createApp(remote.config);
  const second = await app.execute('save_playlist_update', { playlistId: 'target', entries });
  expect(second.status).toBe('ok');
  if (second.status !== 'ok') return;
  const secondRef = { draftId: (second.data as { id: string }).id, revision: 1 };
  await app.execute('preview_playlist_update', secondRef);
  expect(
    (await app.execute('apply_playlist_update', { ...secondRef, operationKey: 'bypass' })).status,
  ).toBe('operation_busy');
  const decision = {
    operationId: operation.id,
    recoveryKey: 'accept',
    expectedRecoveryVersion: 0,
    action: 'accept_intended',
    reason: 'Operator confirmed request completed.',
  };
  expect((await app.execute('reconcile_playlist_update', decision)).status).toBe('invalid_input');
  const recovered = await app.execute('reconcile_playlist_update', {
    ...decision,
    cannotStillExecute: true,
  });
  expect(recovered.data).toMatchObject({ status: 'succeeded', recoveryVersion: 1 });
  expect(
    await app.execute('reconcile_playlist_update', { ...decision, cannotStillExecute: true }),
  ).toEqual(recovered);
  expect(remote.controls.appendRequests).toBe(1);
});

test('concurrent drafts serialize per target and recheck the waiting snapshot', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({ id: 'target', name: 'Target', public: true, entry: [] });
  const first = createApp(remote.config);
  const second = createApp(remote.config);
  t.onTestFinished(() => {
    first.close();
    second.close();
  });
  const refs: { draftId: string; revision: number }[] = [];
  for (const app of [first, second]) {
    const saved = await app.execute('save_playlist_update', {
      playlistId: 'target',
      entries: [{ request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' }],
    });
    expect(saved.status).toBe('ok');
    const ref = { draftId: (saved.data as { id: string }).id, revision: 1 };
    await app.execute('preview_playlist_update', ref);
    refs.push(ref);
  }
  remote.controls.delayAppendMs = 100;
  const results = await Promise.all(
    [first, second].map((app, i) =>
      app.execute('apply_playlist_update', { ...refs[i], operationKey: 'concurrent-' + i }),
    ),
  );
  expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'operation_busy')).toHaveLength(1);
  expect(remote.controls.appendRequests).toBe(1);
  const loser = results.findIndex((r) => r.status === 'operation_busy');
  const again = await [first, second][loser]!.execute('apply_playlist_update', {
    ...refs[loser],
    operationKey: 'later',
  });
  expect(again.status).toBe('target_changed');
  expect(remote.controls.appendRequests).toBe(1);
});

test('unexpected append results require explicit reconciliation and never trigger repair', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({ id: 'target', name: 'Target', public: true, entry: [remote.songs[0]!] });
  const app = createApp(remote.config);
  t.onTestFinished(() => app.close());
  const saved = await app.execute('save_playlist_update', {
    playlistId: 'target',
    entries: ['other', 'other'].map((trackId) => ({
      request: { title: 'Teardrop', artist: 'Massive Attack' },
      trackId,
    })),
  });
  const ref = { draftId: (saved.data as { id: string }).id, revision: 1 };
  await app.execute('preview_playlist_update', ref);
  remote.controls.dropLastTrack = true;
  const applied = await app.execute('apply_playlist_update', { ...ref, operationKey: 'partial' });
  expect(applied.data).toMatchObject({ status: 'verification_failed' });
  const operation = applied.data as { id: string };
  const decision = {
    operationId: operation.id,
    recoveryKey: 'partial-recovery',
    expectedRecoveryVersion: 0,
    cannotStillExecute: true,
    reason: 'Operator verified completion and accepts partial contents.',
  };
  expect(
    (await app.execute('reconcile_playlist_update', { ...decision, action: 'accept_intended' }))
      .status,
  ).toBe('adoption_mismatch');
  expect(
    (await app.execute('reconcile_playlist_update', { ...decision, action: 'accept_current' }))
      .data,
  ).toMatchObject({
    status: 'reconciled',
    current: { tracks: [{ id: 'studio' }, { id: 'other' }] },
  });
  expect(
    (await app.execute('apply_playlist_update', { ...ref, operationKey: 'repeat-partial' })).data,
  ).toMatchObject({ status: 'reconciled' });
  expect(remote.controls.appendRequests).toBe(1);
  expect(remote.controls.creationRequests).toBe(0);
});
