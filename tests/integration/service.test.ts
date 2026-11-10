import { test } from 'vitest';
import assert from 'node:assert/strict';
import { navidromeFixture } from '../support/navidrome.ts';
import type { PlaylistService } from '../../src/playlists/service.ts';
import { createApp } from '../../src/app.ts';

async function ok<T>(service: PlaylistService, tool: string, input: unknown): Promise<T> {
  const result = await service.execute(tool, input);
  assert.equal(result.status, 'ok', JSON.stringify(result));
  return result.data as T;
}

type Draft = {
  id: string;
  revision: number;
  name: string;
  visibility: string;
  entries: { request: { title: string; artist: string }; track?: { id: string }; omit?: boolean }[];
  previewed: boolean;
  locked: boolean;
};
type Operation = {
  id: string;
  status: string;
  playlistId?: string;
  revision: number;
  details?: unknown;
};

async function ready(service: PlaylistService, visibility: 'public' | 'private' = 'public') {
  const draft = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Evening',
    visibility,
    entries: [
      { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
      { request: { title: 'Absent', artist: 'Nobody' }, omit: true },
      { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
    ],
  });
  await ok(service, 'preview_playlist', { draftId: draft.id, revision: 1 });
  return draft;
}

test('matching selects clear recordings, preserves occurrences, and leaves versions ambiguous', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const result = await service.execute('resolve_tracks', {
    songs: [
      { title: '  TEARDROP ', artist: 'Massive Attack' },
      { title: 'Teardrop', artist: 'Massive Attack' },
      { title: 'Hallelujah', artist: 'Jeff Buckley' },
      { title: 'Absent', artist: 'Nobody' },
    ],
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.data, {
    resolutions: [
      { status: 'selected', track: remote.songs[2], candidates: [remote.songs[2]] },
      { status: 'selected', track: remote.songs[2], candidates: [remote.songs[2]] },
      { status: 'ambiguous', candidates: [remote.songs[0], remote.songs[1]] },
      { status: 'missing', candidates: [] },
    ],
  });
});

test('explicit version and album constraints can disambiguate recordings', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const { resolutions } = await ok<{ resolutions: { status: string; track?: { id: string } }[] }>(
    service,
    'resolve_tracks',
    {
      songs: [
        { title: 'Hallelujah (Live)', artist: 'Jeff Buckley' },
        { title: 'Hallelujah', artist: 'Jeff Buckley', version: 'Live' },
        { title: 'Hallelujah', artist: 'Jeff Buckley', album: 'Grace', duration: 413 },
      ],
    },
  );
  assert.deepEqual(
    resolutions.map((r) => [r.status, r.track?.id]),
    [
      ['selected', 'live'],
      ['selected', 'live'],
      ['selected', 'studio'],
    ],
  );
});

test('alternate takes are candidates rather than silently ignored version distinctions', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.songs.push({
    id: 'alternate',
    title: 'Teardrop (Alternate Take)',
    artist: 'Massive Attack',
  });
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const { resolutions } = await ok<{ resolutions: { status: string; track?: { id: string } }[] }>(
    service,
    'resolve_tracks',
    {
      songs: [
        { title: 'Teardrop', artist: 'Massive Attack' },
        { title: 'Teardrop (Alternate Take)', artist: 'Massive Attack' },
      ],
    },
  );
  assert.deepEqual(
    resolutions.map((r) => [r.status, r.track?.id]),
    [
      ['ambiguous', undefined],
      ['selected', 'alternate'],
    ],
  );
});

test('extended versions remain candidates for an unqualified title', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  remote.songs.push({ id: 'extended', title: 'Teardrop - Extended', artist: 'Massive Attack' });
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const { resolutions } = await ok<{
    resolutions: { status: string; track?: { id: string }; candidates: { id: string }[] }[];
  }>(service, 'resolve_tracks', {
    songs: [
      { title: 'Teardrop', artist: 'Massive Attack' },
      { title: 'Teardrop - Extended', artist: 'Massive Attack' },
    ],
  });
  assert.deepEqual(
    resolutions[0]!.candidates.map((c) => c.id),
    ['other', 'extended'],
  );
  assert.equal(resolutions[0]!.status, 'ambiguous');
  assert.equal(resolutions[1]!.track?.id, 'extended');
});

test('drafts survive restart, validate real track IDs, and reject stale edits', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  let service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const entries = [
    { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
    { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
  ];
  const created = await ok<Draft>(service, 'save_playlist_draft', { name: 'Evening', entries });
  assert.equal(created.visibility, 'public');
  assert.equal(created.revision, 1);
  assert.deepEqual(
    created.entries.map((e) => e.track?.id),
    ['other', 'other'],
  );
  const preview = await ok<Draft>(service, 'preview_playlist', {
    draftId: created.id,
    revision: 1,
  });
  assert.equal(preview.previewed, true);
  service.close();
  service = createApp(remote.config);
  assert.equal(
    (await ok<Draft>(service, 'get_playlist_draft', { draftId: created.id })).previewed,
    true,
  );
  const updated = await ok<Draft>(service, 'save_playlist_draft', {
    draftId: created.id,
    expectedRevision: 1,
    name: 'Private evening',
    visibility: 'private',
    entries,
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.previewed, false);
  assert.equal(
    (
      await service.execute('save_playlist_draft', {
        draftId: created.id,
        expectedRevision: 1,
        name: 'Stale',
        entries,
      })
    ).status,
    'stale_revision',
  );
  const historical = await ok<Draft>(service, 'get_playlist_draft', {
    draftId: created.id,
    revision: 1,
  });
  assert.equal(historical.name, 'Evening');
  assert.equal(
    (
      await service.execute('save_playlist_draft', {
        name: 'Invalid',
        entries: [{ request: entries[0]!.request, trackId: 'nonexistent' }],
      })
    ).status,
    'navidrome_error',
  );
});

test('publishing verifies public visibility and repeated tracks, then returns the same operation across restarts', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  let service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const draft = await ready(service);
  const input = { draftId: draft.id, revision: 1, operationKey: 'publish-evening' };
  const operation = await ok<Operation>(service, 'publish_playlist', input);
  assert.equal(operation.status, 'succeeded');
  assert.equal(operation.playlistId, 'p1');
  assert.deepEqual(remote.playlists[0], {
    id: 'p1',
    name: 'Evening',
    public: true,
    entry: [remote.songs[2], remote.songs[2]],
  });
  service.close();
  service = createApp(remote.config);
  const repeat = await ok<Operation>(service, 'publish_playlist', {
    ...input,
    operationKey: 'different-key',
  });
  assert.equal(repeat.id, operation.id);
  assert.equal(remote.playlists.length, 1);
  assert.equal(
    (
      await service.execute('save_playlist_draft', {
        draftId: draft.id,
        expectedRevision: 1,
        name: 'Changed',
        entries: [],
      })
    ).status,
    'draft_locked',
  );
});

test('alternate keys used for a repeated publication cannot be reused for another draft', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const first = await ready(service);
  await ok(service, 'publish_playlist', { draftId: first.id, revision: 1, operationKey: 'first' });
  await ok(service, 'publish_playlist', { draftId: first.id, revision: 1, operationKey: 'alias' });
  const second = await ready(service);
  assert.equal(
    (
      await service.execute('publish_playlist', {
        draftId: second.id,
        revision: 1,
        operationKey: 'alias',
      })
    ).status,
    'operation_key_conflict',
  );
  assert.equal(remote.playlists.length, 1);
});

test('unverified visibility remains incomplete and resumes the known playlist without another creation', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const draft = await ready(service);
  remote.controls.visibilityIgnored = true;
  const operation = await ok<Operation>(service, 'publish_playlist', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'visibility',
  });
  assert.equal(operation.status, 'incomplete');
  assert.equal(operation.playlistId, 'p1');
  remote.controls.visibilityIgnored = false;
  const resumed = await ok<Operation>(service, 'reconcile_operation', {
    operationId: operation.id,
    action: 'resume',
    recoveryKey: 'resume-visibility',
    expectedRecoveryVersion: 0,
  });
  assert.equal(resumed.status, 'succeeded');
  assert.equal(remote.playlists.length, 1);
});

test('publishing enforces preview, exact approval, resolved nonempty contents, and fresh library metadata', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp({ ...remote.config, requireApproval: true });
  t.onTestFinished(() => service.close());
  const draft = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Review',
    entries: [{ request: { title: 'Missing', artist: 'Nobody' } }],
  });
  const publish = (revision: number, approved = revision) =>
    service.execute('publish_playlist', {
      draftId: draft.id,
      revision,
      operationKey: 'review',
      approval: { revision: approved, confirmed: true },
    });
  assert.equal((await publish(1)).status, 'preview_required');
  await ok(service, 'preview_playlist', { draftId: draft.id, revision: 1 });
  assert.equal(
    (
      await service.execute('publish_playlist', {
        draftId: draft.id,
        revision: 1,
        operationKey: 'review',
      })
    ).status,
    'approval_required',
  );
  assert.equal((await publish(1)).status, 'unresolved_songs');
  await ok(service, 'save_playlist_draft', {
    draftId: draft.id,
    expectedRevision: 1,
    name: 'Review',
    entries: [],
  });
  await ok(service, 'preview_playlist', { draftId: draft.id, revision: 2 });
  assert.equal((await publish(2)).status, 'empty_playlist');
  const selection = [
    { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
  ];
  await ok(service, 'save_playlist_draft', {
    draftId: draft.id,
    expectedRevision: 2,
    name: 'Review',
    entries: selection,
  });
  await ok(service, 'preview_playlist', { draftId: draft.id, revision: 3 });
  assert.equal((await publish(3, 2)).status, 'approval_required');
  remote.songs[2]!.duration = 331;
  assert.equal((await publish(3)).status, 'library_changed');
  assert.equal(remote.playlists.length, 0);
  await ok(service, 'save_playlist_draft', {
    draftId: draft.id,
    expectedRevision: 3,
    name: 'Review',
    entries: selection,
  });
  await ok(service, 'preview_playlist', { draftId: draft.id, revision: 4 });
  assert.equal((await publish(3)).status, 'stale_revision');
  assert.equal((await publish(4)).status, 'ok');
  assert.equal(remote.playlists.length, 1);
});

test('two service instances sharing SQLite cannot publish the same draft twice', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const first = createApp(remote.config);
  const second = createApp(remote.config);
  t.onTestFinished(() => {
    first.close();
    second.close();
  });
  const draft = await ready(first);
  remote.controls.delayCreateMs = 100;
  const operations = await Promise.all(
    [first, second].map((service, index) =>
      ok<Operation>(service, 'publish_playlist', {
        draftId: draft.id,
        revision: 1,
        operationKey: `publisher-${index}`,
      }),
    ),
  );
  assert.equal(operations[0]!.id, operations[1]!.id);
  assert.equal(remote.playlists.length, 1);
  const stored = await ok<Operation>(second, 'get_operation', { operationId: operations[0]!.id });
  assert.equal(stored.status, 'succeeded');
});

test('a server dropping a requested occurrence produces verification failure and retains the playlist', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const draft = await ready(service);
  remote.controls.dropLastTrack = true;
  const operation = await ok<Operation>(service, 'publish_playlist', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'mismatch',
  });
  assert.equal(operation.status, 'verification_failed');
  assert.equal(operation.playlistId, 'p1');
  assert.deepEqual(
    (operation.details as { expectedIds: string[]; actualIds: string[] }).expectedIds,
    ['other', 'other'],
  );
  assert.deepEqual(
    remote.playlists[0]?.entry.map((s) => s.id),
    ['other'],
  );
  assert.equal(remote.playlists.length, 1);
});

test('bounded search reports incomplete rather than a false match or absence, and redacts upstream errors', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp({ ...remote.config, searchPageSize: 1, searchMaxPages: 1 });
  t.onTestFinished(() => service.close());
  const { resolutions } = await ok<{ resolutions: { status: string }[] }>(
    service,
    'resolve_tracks',
    {
      songs: [
        { title: 'Hallelujah', artist: 'Jeff Buckley', album: 'Grace' },
        { title: 'Unknown', artist: 'Nobody' },
      ],
    },
  );
  assert.deepEqual(
    resolutions.map((r) => r.status),
    ['incomplete', 'incomplete'],
  );
  remote.controls.leakError = true;
  const result = await service.execute('search_tracks', { query: 'Teardrop' });
  assert.equal(result.status, 'navidrome_error');
  assert.equal(JSON.stringify(result).includes('secret-password'), false);
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
});

test('a lost creation response stays unknown across restarts and can adopt the explicitly identified playlist', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  let service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const draft = await ready(service);
  remote.controls.dropCreateResponse = true;
  const operation = await ok<Operation>(service, 'publish_playlist', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'uncertain',
  });
  assert.equal(operation.status, 'unknown_outcome');
  assert.equal(remote.playlists.length, 1);
  service.close();
  service = createApp(remote.config);
  const repeated = await ok<Operation>(service, 'publish_playlist', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'cannot-bypass',
  });
  assert.equal(repeated.id, operation.id);
  assert.equal(repeated.status, 'unknown_outcome');
  remote.controls.dropCreateResponse = false;
  const adopted = await ok<Operation>(service, 'reconcile_operation', {
    operationId: operation.id,
    action: 'adopt',
    playlistId: 'p1',
    reason: 'User identified the created playlist.',
    recoveryKey: 'adopt-p1',
    expectedRecoveryVersion: 0,
  });
  assert.equal(adopted.status, 'succeeded');
  assert.equal(adopted.playlistId, 'p1');
  assert.equal(remote.playlists.length, 1);
});

test('repeating a recovery decision after another lost response never creates twice', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const draft = await ready(service);
  remote.controls.dropCreateResponse = true;
  const operation = await ok<Operation>(service, 'publish_playlist', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'lost',
  });
  // Simulate an operator inspecting and removing the first uncertain result.
  remote.playlists.length = 0;
  const decision = {
    operationId: operation.id,
    action: 'confirm_not_created',
    reason: 'Operator confirmed no created playlist remains.',
    recoveryKey: 'retry-once',
    expectedRecoveryVersion: 0,
  };
  const recovered = await ok<Operation>(service, 'reconcile_operation', decision);
  assert.equal(recovered.status, 'unknown_outcome');
  assert.equal(remote.playlists.length, 1);
  await ok(service, 'reconcile_operation', decision);
  assert.equal(remote.playlists.length, 1);
});

test('a non-creation assertion cannot retry tracks whose metadata changed after preview', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const draft = await ready(service);
  remote.controls.dropCreateResponse = true;
  const operation = await ok<Operation>(service, 'publish_playlist', {
    draftId: draft.id,
    revision: 1,
    operationKey: 'lost',
  });
  remote.playlists.length = 0;
  remote.songs[2]!.title = 'Changed recording';
  remote.controls.dropCreateResponse = false;
  const result = await service.execute('reconcile_operation', {
    operationId: operation.id,
    action: 'confirm_not_created',
    reason: 'Confirmed absent.',
    recoveryKey: 'changed-retry',
    expectedRecoveryVersion: 0,
  });
  assert.equal(result.status, 'library_changed');
  assert.equal(remote.playlists.length, 0);
});

test('copying a locked draft intentionally creates another private playlist with the same name', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const original = await ready(service, 'private');
  await ok(service, 'publish_playlist', {
    draftId: original.id,
    revision: 1,
    operationKey: 'original',
  });
  const copy = await ok<Draft>(service, 'copy_playlist_draft', {
    draftId: original.id,
    revision: 1,
  });
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.locked, false);
  assert.equal(copy.previewed, false);
  await ok(service, 'preview_playlist', { draftId: copy.id, revision: 1 });
  await ok(service, 'publish_playlist', { draftId: copy.id, revision: 1, operationKey: 'copy' });
  assert.deepEqual(
    remote.playlists.map((p) => [p.name, p.public]),
    [
      ['Evening', false],
      ['Evening', false],
    ],
  );
  const list = await ok<{ playlists: { id: string }[] }>(service, 'list_playlists', {});
  assert.deepEqual(
    list.playlists.map((p) => p.id),
    ['p1', 'p2'],
  );
  const playlist = await ok<{ tracks: { id: string }[] }>(service, 'get_playlist', {
    playlistId: 'p2',
  });
  assert.deepEqual(
    playlist.tracks.map((s) => s.id),
    ['other', 'other'],
  );
});
