import type { TestContext } from 'vitest';
import type { ToolName, ToolData, Config } from '../../src/playlists/domain.ts';
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

test('Navidrome 0.64.2 omitted false visibility permits private append while unverified responses stay blocked', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.controls.serverType = 'navidrome';
  remote.controls.serverVersion = '0.64.2 (10114574)';
  remote.controls.omitPrivateVisibility = true;
  remote.playlists.push({
    id: 'private',
    name: 'Private',
    public: false,
    entry: [remote.songs[0]!],
  });
  const app = createApp(remote.config);
  t.onTestFinished(() => app.close());
  const saved = await app.execute('save_playlist_update', {
    playlistId: 'private',
    entries: [{ request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' }],
  });
  expect(saved.status).toBe('ok');
  const ref = { draftId: (saved.data as { id: string }).id, revision: 1 };
  expect((await app.execute('list_playlists', {})).data).toMatchObject({
    playlists: [{ id: 'private', public: false }],
  });
  await app.execute('preview_playlist_update', ref);
  expect(
    (await app.execute('apply_playlist_update', { ...ref, operationKey: 'omitted-private' })).data,
  ).toMatchObject({ status: 'succeeded' });
  expect(remote.playlists[0]).toMatchObject({ public: false, name: 'Private' });
  expect(remote.playlists[0]!.entry.map((t) => t.id)).toEqual(['studio', 'other']);
  for (const [type, version, minimal] of [
    ['other-server', '0.64.2', false],
    ['navidrome', '0.65.0', false],
    ['navidrome', '0.64.2', true],
  ] as const) {
    remote.controls.serverType = type;
    remote.controls.serverVersion = version;
    remote.controls.minimalPlaylistResponse = minimal;
    expect(
      (await app.execute('save_playlist_update', { playlistId: 'private', entries: [] })).status,
    ).toBe('navidrome_error');
  }
  expect(remote.controls.appendRequests).toBe(1);
});

test('recovery inspection classifies evidence and records occurrence, order and metadata differences', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({
    id: 'target',
    name: 'Original',
    public: false,
    entry: [remote.songs[0]!, remote.songs[1]!],
  });
  let app = createApp(remote.config);
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
  remote.controls.dropAppendResponse = true;
  const applied = await app.execute('apply_playlist_update', {
    ...ref,
    operationKey: 'inspect-evidence',
  });
  const operationId = (applied.data as { id: string }).id;
  const inspect = () => app.execute('get_update_operation', { operationId });
  expect((await inspect()).data).toMatchObject({
    comparison: { relationship: 'intended', matchesOriginal: false, matchesIntended: true },
    observationWarning: expect.stringContaining('cannot establish'),
  });
  remote.playlists[0]!.name = 'External edit';
  remote.playlists[0]!.public = true;
  remote.playlists[0]!.entry = [remote.songs[1]!, remote.songs[0]!, remote.songs[2]!];
  const inspected = await inspect();
  expect(inspected.data).toMatchObject({
    comparison: {
      relationship: 'unexpected',
      fromIntended: {
        nameChanged: true,
        visibilityChanged: true,
        orderedTracksChanged: true,
        occurrenceChanges: [{ trackId: 'other', expectedCount: 2, actualCount: 1 }],
        positionChanges: [
          { index: 0, expectedTrackId: 'studio', actualTrackId: 'live' },
          { index: 1, expectedTrackId: 'live', actualTrackId: 'studio' },
          { index: 3, expectedTrackId: 'other', actualTrackId: null },
        ],
      },
    },
  });
  const decision = await app.execute('reconcile_playlist_update', {
    operationId,
    recoveryKey: 'accept-unexpected-evidence',
    expectedRecoveryVersion: 0,
    action: 'accept_current',
    cannotStillExecute: true,
    reason: 'External investigation established completion.',
  });
  expect(decision.data).toMatchObject({
    status: 'reconciled',
    comparison: { relationship: 'unexpected' },
  });
  app.close();
  app = createApp(remote.config);
  expect((await inspect()).data).toMatchObject({
    operation: { comparison: { relationship: 'unexpected', fromIntended: { nameChanged: true } } },
  });
  expect(remote.controls.appendRequests).toBe(1);
});

async function ok<K extends ToolName>(
  app: ReturnType<typeof createApp>,
  name: K,
  input: unknown,
): Promise<ToolData[K]> {
  const result = await app.execute(name, input);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('Unexpected service outcome: ' + result.status);
  return result.data;
}

async function editableUpdate(t: TestContext, overrides: Partial<Config> = {}) {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.playlists.push({
    id: 'target',
    name: 'Target',
    public: false,
    entry: [remote.songs[0]!, remote.songs[1]!],
  });
  const app = createApp({ ...remote.config, ...overrides });
  t.onTestFinished(() => app.close());
  const entries = [{ request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' }];
  const draft = await ok(app, 'save_playlist_update', { playlistId: 'target', entries });
  const ref = { draftId: draft.id, revision: 1 };
  await ok(app, 'preview_playlist_update', ref);
  return { remote, app, entries, ref };
}

test('deliberate retry requires both assertions and stale or repeated recovery decisions never append again', async (t) => {
  const { remote, app, ref } = await editableUpdate(t);
  remote.controls.dropBeforeAppend = true;
  const operation = await ok(app, 'apply_playlist_update', {
    ...ref,
    operationKey: 'before-dispatch-loss',
  });
  expect(operation.status).toBe('unknown_outcome');
  const inspected = await ok(app, 'get_update_operation', { operationId: operation.id });
  expect(inspected.comparison.relationship).toBe('original');
  const decision = {
    operationId: operation.id,
    recoveryKey: 'retry-once',
    expectedRecoveryVersion: 0,
    action: 'retry',
    cannotStillExecute: true,
    reason: 'Operator confirmed request did not apply and cannot execute.',
  };
  expect((await app.execute('reconcile_playlist_update', decision)).status).toBe('invalid_input');
  expect(
    (
      await app.execute('reconcile_playlist_update', {
        ...decision,
        didNotApply: true,
        cannotStillExecute: false,
      })
    ).status,
  ).toBe('invalid_input');
  const retry = await ok(app, 'reconcile_playlist_update', { ...decision, didNotApply: true });
  expect(retry).toMatchObject({ status: 'unknown_outcome', recoveryVersion: 1 });
  expect(remote.controls.appendRequests).toBe(2);
  expect(await ok(app, 'reconcile_playlist_update', { ...decision, didNotApply: true })).toEqual(
    retry,
  );
  expect(
    (
      await app.execute('reconcile_playlist_update', {
        ...decision,
        didNotApply: true,
        reason: 'Different assertion',
      })
    ).status,
  ).toBe('recovery_key_conflict');
  expect(
    (
      await app.execute('reconcile_playlist_update', {
        ...decision,
        didNotApply: true,
        recoveryKey: 'stale',
      })
    ).status,
  ).toBe('stale_recovery');
  remote.playlists[0]!.entry.reverse();
  expect(
    (
      await app.execute('reconcile_playlist_update', {
        ...decision,
        didNotApply: true,
        recoveryKey: 'changed-baseline',
        expectedRecoveryVersion: 1,
      })
    ).status,
  ).toBe('target_changed');
  expect(remote.controls.appendRequests).toBe(2);
  remote.playlists[0]!.entry.reverse();
  remote.controls.dropBeforeAppend = false;
  const succeeded = await ok(app, 'reconcile_playlist_update', {
    ...decision,
    didNotApply: true,
    recoveryKey: 'retry-success',
    expectedRecoveryVersion: 1,
  });
  expect(succeeded).toMatchObject({ status: 'succeeded', recoveryVersion: 2 });
  expect(remote.playlists[0]!.entry.map((s) => s.id)).toEqual(['studio', 'live', 'other']);
  expect(remote.controls.appendRequests).toBe(3);
  expect(
    (
      await app.execute('save_playlist_update', {
        draftId: ref.draftId,
        expectedRevision: 1,
        entries: [],
      })
    ).status,
  ).toBe('draft_locked');
});

test('verification read failure and an external edit during append stay blocked without repair', async (t) => {
  const { remote, app, ref } = await editableUpdate(t);
  remote.controls.onAppend = () => {
    remote.playlists[0]!.entry.unshift(remote.songs[2]!);
  };
  remote.controls.failVerificationRead = true;
  const operation = await ok(app, 'apply_playlist_update', {
    ...ref,
    operationKey: 'verification-read-failure',
  });
  expect(operation.status).toBe('unknown_outcome');
  remote.controls.failVerificationRead = false;
  const inspected = await ok(app, 'get_update_operation', { operationId: operation.id });
  expect(inspected.comparison.relationship).toBe('unexpected');
  expect(inspected.current.tracks.map((t) => t.id)).toEqual(['other', 'studio', 'live', 'other']);
  expect(remote.playlists[0]).toMatchObject({ name: 'Target', public: false });
  const other = await ok(app, 'save_playlist_update', { playlistId: 'target', entries: [] });
  await ok(app, 'preview_playlist_update', { draftId: other.id, revision: 1 });
  expect(
    (
      await app.execute('apply_playlist_update', {
        draftId: other.id,
        revision: 1,
        operationKey: 'blocked',
      })
    ).status,
  ).toBe('operation_busy');
  expect(remote.controls.appendRequests).toBe(1);
  expect(remote.controls.creationRequests).toBe(0);
});

for (const kind of [
  'addition',
  'removal',
  'reorder',
  'repetition',
  'rename',
  'visibility',
] as const) {
  test('target ' + kind + ' changes reject dispatch and require a fresh preview', async (t) => {
    const { remote, app, ref } = await editableUpdate(t);
    const target = remote.playlists[0]!;
    if (kind === 'addition') target.entry.push(remote.songs[2]!);
    if (kind === 'removal') target.entry.pop();
    if (kind === 'reorder') target.entry.reverse();
    if (kind === 'repetition') target.entry.push(remote.songs[0]!);
    if (kind === 'rename') target.name = 'Changed';
    if (kind === 'visibility') target.public = true;
    expect(
      (await app.execute('apply_playlist_update', { ...ref, operationKey: kind })).status,
    ).toBe('target_changed');
    const refreshed = await ok(app, 'refresh_playlist_update', ref);
    expect(refreshed.draft.previewed).toBe(false);
    expect(refreshed.draft.entries.map((e) => e.track?.id)).toEqual(['other']);
    expect(remote.controls.appendRequests).toBe(0);
  });
}

test('addition and reference limits are separate from an existing target over 500 occurrences', async (t) => {
  const { remote, app } = await editableUpdate(t);
  remote.playlists[0]!.entry = Array.from({ length: 501 }, () => remote.songs[0]!);
  const entry = { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' };
  const omitted = { request: { title: 'Omitted', artist: 'Nobody' }, omit: true };
  expect(
    (
      await app.execute('save_playlist_update', {
        playlistId: 'target',
        entries: Array(501).fill(omitted),
      })
    ).status,
  ).toBe('invalid_input');
  expect(
    (
      await app.execute('save_playlist_update', {
        playlistId: 'target',
        entries: [],
        references: Array(501).fill(omitted),
      })
    ).status,
  ).toBe('invalid_input');
  const draft = await ok(app, 'save_playlist_update', {
    playlistId: 'target',
    entries: Array(500).fill(entry),
    references: Array(500).fill(omitted),
  });
  const preview = await ok(app, 'preview_playlist_update', { draftId: draft.id, revision: 1 });
  expect(preview.existingCount).toBe(501);
  expect(preview.resultingCount).toBe(1001);
  const operation = await ok(app, 'apply_playlist_update', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'five-hundred-additions',
  });
  expect(operation.status).toBe('succeeded');
  expect(remote.playlists[0]!.entry.slice(501).map((t) => t.id)).toEqual(Array(500).fill('other'));
  expect(remote.controls.appendRequests).toBe(1);
});

test('authorized retry rechecks its baseline after addition revalidation', async (t) => {
  const { remote, app, ref } = await editableUpdate(t);
  remote.controls.dropBeforeAppend = true;
  const operation = await ok(app, 'apply_playlist_update', {
    ...ref,
    operationKey: 'retry-revalidation-race',
  });
  remote.controls.dropBeforeAppend = false;
  remote.controls.onGetSong = () => {
    remote.playlists[0]!.name = 'Edited during library validation';
  };
  const result = await app.execute('reconcile_playlist_update', {
    operationId: operation.id,
    recoveryKey: 'retry-race',
    expectedRecoveryVersion: 0,
    action: 'retry',
    cannotStillExecute: true,
    didNotApply: true,
    reason: 'Prior request confirmed nonapplied.',
  });
  expect(result.status).toBe('target_changed');
  expect(remote.controls.appendRequests).toBe(1);
  expect(remote.playlists[0]!.entry.map((t) => t.id)).toEqual(['studio', 'live']);
});

test('missing or unresolved inputs, unavailable additions and explicit omissions stop unsafe writes', async (t) => {
  const { remote, app, entries, ref } = await editableUpdate(t);
  expect(
    (await app.execute('save_playlist_update', { playlistId: 'missing', entries })).status,
  ).toBe('navidrome_error');
  expect((await app.execute('save_playlist_update', { name: 'Target', entries })).status).toBe(
    'invalid_input',
  );
  const unresolved = await ok(app, 'save_playlist_update', {
    playlistId: 'target',
    entries: [
      { request: { title: 'Hallelujah', artist: 'Jeff Buckley' } },
      { request: { title: 'Absent', artist: 'Nobody' } },
    ],
  });
  expect(unresolved.entries.map((e) => e.resolution?.status)).toEqual(['ambiguous', 'missing']);
  await ok(app, 'preview_playlist_update', { draftId: unresolved.id, revision: 1 });
  expect(
    (
      await app.execute('apply_playlist_update', {
        draftId: unresolved.id,
        revision: 1,
        operationKey: 'unresolved',
      })
    ).status,
  ).toBe('unresolved_songs');
  remote.songs.pop();
  expect(
    (await app.execute('apply_playlist_update', { ...ref, operationKey: 'unavailable' })).status,
  ).toBe('navidrome_error');
  const omitted = await ok(app, 'save_playlist_update', {
    draftId: ref.draftId,
    expectedRevision: 1,
    entries: [{ request: entries[0]!.request, omit: true }],
  });
  await ok(app, 'preview_playlist_update', { draftId: omitted.id, revision: 2 });
  expect(
    (
      await ok(app, 'apply_playlist_update', {
        draftId: omitted.id,
        revision: 2,
        operationKey: 'all-omitted',
      })
    ).status,
  ).toBe('no_changes');
  expect(remote.controls.appendRequests).toBe(0);
});

test('update revision edits invalidate preview and exact configured approval', async (t) => {
  const { remote, app, entries, ref } = await editableUpdate(t);
  const approvedApp = createApp({ ...remote.config, requireApproval: true });
  t.onTestFinished(() => approvedApp.close());
  expect(
    (
      await approvedApp.execute('apply_playlist_update', {
        ...ref,
        operationKey: 'requires-approval',
      })
    ).status,
  ).toBe('approval_required');
  await ok(app, 'save_playlist_update', { draftId: ref.draftId, expectedRevision: 1, entries });
  expect(
    (
      await app.execute('save_playlist_update', {
        draftId: ref.draftId,
        expectedRevision: 1,
        entries,
      })
    ).status,
  ).toBe('stale_revision');
  const apply = {
    draftId: ref.draftId,
    revision: 2,
    operationKey: 'edited-approval',
    approval: { revision: 1, confirmed: true },
  };
  expect((await approvedApp.execute('apply_playlist_update', apply)).status).toBe(
    'preview_required',
  );
  await ok(app, 'preview_playlist_update', { draftId: ref.draftId, revision: 2 });
  expect((await approvedApp.execute('apply_playlist_update', apply)).status).toBe(
    'approval_required',
  );
  expect(
    (
      await ok(approvedApp, 'apply_playlist_update', {
        ...apply,
        approval: { revision: 2, confirmed: true },
      })
    ).status,
  ).toBe('succeeded');
  expect(remote.controls.appendRequests).toBe(1);
});

test('a denied append keeps immutable intent and never falls back to creation', async (t) => {
  const { remote, app, ref } = await editableUpdate(t);
  remote.controls.denyAppend = true;
  const operation = await ok(app, 'apply_playlist_update', { ...ref, operationKey: 'denied' });
  expect(operation.status).toBe('unknown_outcome');
  expect(
    (await ok(app, 'get_update_operation', { operationId: operation.id })).comparison.relationship,
  ).toBe('original');
  expect(remote.playlists[0]!.entry.map((t) => t.id)).toEqual(['studio', 'live']);
  expect((await app.execute('refresh_playlist_update', ref)).status).toBe('draft_locked');
  expect(remote.controls.appendRequests).toBe(1);
  expect(remote.controls.creationRequests).toBe(0);
});

test('unresolved reference-only occurrences require selection or explicit omission before applying', async (t) => {
  const { remote, app, entries } = await editableUpdate(t);
  for (const request of [
    { title: 'Hallelujah', artist: 'Jeff Buckley' },
    { title: 'Absent', artist: 'Nobody' },
  ]) {
    const draft = await ok(app, 'save_playlist_update', {
      playlistId: 'target',
      entries,
      references: [{ request }],
    });
    await ok(app, 'preview_playlist_update', { draftId: draft.id, revision: 1 });
    expect(
      (
        await app.execute('apply_playlist_update', {
          draftId: draft.id,
          revision: 1,
          operationKey: 'unresolved-ref-' + request.title,
        })
      ).status,
    ).toBe('unresolved_songs');
    const revised = await ok(app, 'save_playlist_update', {
      draftId: draft.id,
      expectedRevision: 1,
      entries,
      references: [{ request, omit: true }],
    });
    expect(revised.update!.references[0]!.omit).toBe(true);
  }
  expect(remote.controls.appendRequests).toBe(0);
});

test('deleted targets and incomplete addition or reference matching prevent dispatch', async (t) => {
  const { remote, app, ref } = await editableUpdate(t);
  const limited = createApp({ ...remote.config, searchMaxPages: 1, searchPageSize: 1 });
  t.onTestFinished(() => limited.close());
  const request = { title: 'Hallelujah', artist: 'Jeff Buckley', album: 'Grace' };
  const incomplete = await ok(limited, 'save_playlist_update', {
    playlistId: 'target',
    entries: [{ request }],
    references: [{ request }],
  });
  expect(incomplete.entries[0]!.resolution?.status).toBe('incomplete');
  expect(incomplete.update!.references[0]!.resolution?.status).toBe('incomplete');
  await ok(limited, 'preview_playlist_update', { draftId: incomplete.id, revision: 1 });
  expect(
    (
      await limited.execute('apply_playlist_update', {
        draftId: incomplete.id,
        revision: 1,
        operationKey: 'incomplete-search',
      })
    ).status,
  ).toBe('unresolved_songs');
  remote.playlists.length = 0;
  expect(
    (await app.execute('apply_playlist_update', { ...ref, operationKey: 'deleted-target' })).status,
  ).toBe('navidrome_error');
  expect((await ok(app, 'get_playlist_update', { draftId: ref.draftId })).locked).toBe(false);
  expect(remote.controls.appendRequests).toBe(0);
  expect(remote.controls.creationRequests).toBe(0);
});

test('two instances serialize recovery and cannot release or rewrite a closed operation', async (t) => {
  const { remote, app, ref } = await editableUpdate(t);
  remote.controls.dropAppendResponse = true;
  const operation = await ok(app, 'apply_playlist_update', {
    ...ref,
    operationKey: 'recovery-concurrency',
  });
  const other = createApp(remote.config);
  t.onTestFinished(() => other.close());
  const decisions = await Promise.all(
    [app, other].map((service, index) =>
      service.execute('reconcile_playlist_update', {
        operationId: operation.id,
        recoveryKey: 'concurrent-recovery-' + index,
        expectedRecoveryVersion: 0,
        action: 'accept_intended',
        cannotStillExecute: true,
        reason: 'Operator established completion.',
      }),
    ),
  );
  expect(decisions.filter((result) => result.status === 'ok')).toHaveLength(1);
  expect(decisions.filter((result) => result.status === 'operation_busy')).toHaveLength(1);
  expect(
    (await ok(app, 'get_update_operation', { operationId: operation.id })).operation,
  ).toMatchObject({
    status: 'succeeded',
    recoveryVersion: 1,
    comparison: { relationship: 'intended' },
  });
  expect(
    (
      await other.execute('reconcile_playlist_update', {
        operationId: operation.id,
        recoveryKey: 'cannot-reopen',
        expectedRecoveryVersion: 1,
        action: 'accept_current',
        cannotStillExecute: true,
        reason: 'Late request.',
      })
    ).status,
  ).toBe('invalid_recovery');
  expect(remote.controls.appendRequests).toBe(1);
});

test('a timed-out append that executes later remains blocked across restart even when contents eventually match', async (t) => {
  const { remote, app, ref } = await editableUpdate(t, { timeoutMs: 100 });
  remote.controls.delayAppendMs = 400;
  const operation = await ok(app, 'apply_playlist_update', {
    ...ref,
    operationKey: 'delayed-timeout',
  });
  expect(operation.status).toBe('unknown_outcome');
  const restarted = createApp(remote.config);
  t.onTestFinished(() => restarted.close());
  expect(
    (await ok(restarted, 'get_update_operation', { operationId: operation.id })).comparison
      .relationship,
  ).toBe('original');
  const deadline = Date.now() + 2000;
  while (remote.playlists[0]!.entry.length === 2 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  const inspection = await ok(restarted, 'get_update_operation', { operationId: operation.id });
  expect(inspection.comparison.relationship).toBe('intended');
  expect(inspection.operation.status).toBe('unknown_outcome');
  const other = await ok(restarted, 'save_playlist_update', { playlistId: 'target', entries: [] });
  await ok(restarted, 'preview_playlist_update', { draftId: other.id, revision: 1 });
  expect(
    (
      await restarted.execute('apply_playlist_update', {
        draftId: other.id,
        revision: 1,
        operationKey: 'matching-still-blocked',
      })
    ).status,
  ).toBe('operation_busy');
  expect(
    (await ok(restarted, 'apply_playlist_update', { ...ref, operationKey: 'same-after-timeout' }))
      .id,
  ).toBe(operation.id);
  expect(remote.controls.appendRequests).toBe(1);
});
