import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../../src/app.ts';
import type { Draft } from '../../src/playlists/domain.ts';
import { navidromeFixture } from '../support/navidrome.ts';

async function audioMuseFixture() {
  const controls = {
    onSimilarity: undefined as (() => Promise<void>) | undefined,
    onVersion: undefined as (() => Promise<void>) | undefined,
    onServers: undefined as (() => Promise<void>) | undefined,
    navidromeUrl: '',
    fail: false,
    analysisFails: false,
    byReference: {} as Record<
      string,
      { item_id: string; title: string; author: string; similarity: number; distance: number }[]
    >,
    rows: [] as {
      item_id: string;
      title: string;
      author: string;
      similarity: number;
      distance: number;
    }[],
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    if (
      req.headers.authorization !== 'Bearer secret-audiomuse-token' ||
      url.searchParams.get('server') !== 'navidrome'
    ) {
      res.writeHead(401).end();
      return;
    }
    if (url.pathname === '/api/similar_tracks') await controls.onSimilarity?.();
    if (url.pathname === '/api/version') await controls.onVersion?.();
    if (url.pathname === '/api/servers') await controls.onServers?.();
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = controls.fail
      ? 401
      : controls.analysisFails && url.pathname === '/api/max_distance'
        ? 404
        : 200;
    res.end(
      JSON.stringify(
        controls.fail
          ? { error: 'secret-audiomuse-token' }
          : url.pathname === '/api/servers'
            ? {
                servers: [
                  {
                    server_id: 'navidrome',
                    name: 'Fixture',
                    server_type: 'navidrome',
                    creds: { url: controls.navidromeUrl },
                  },
                ],
              }
            : url.pathname === '/api/clap/search'
              ? { results: controls.rows }
              : url.pathname === '/api/similar_tracks'
                ? (controls.byReference[url.searchParams.get('item_id')!] ?? controls.rows)
                : url.pathname === '/api/max_distance'
                  ? { max_distance: 1 }
                  : { app_version: 'v3.7.1' },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    controls,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

test('AudioMuse is optional and authenticated connectivity failures do not expose credentials', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const absent = createApp(remote.config);
  t.onTestFinished(() => absent.close());
  assert.equal(
    (await absent.execute('check_audiomuse_connection', {})).status,
    'audiomuse_unavailable',
  );
  assert.equal((await absent.execute('check_connection', {})).status, 'ok');
  const service = createApp({
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
    },
  });
  t.onTestFinished(() => service.close());
  assert.deepEqual(await service.execute('check_audiomuse_connection', {}), {
    status: 'ok',
    data: { connected: true, version: 'v3.7.1', calibrated: false },
  });
  audio.controls.fail = true;
  const result = await service.execute('check_audiomuse_connection', {});
  assert.equal(result.status, 'audiomuse_error');
  assert(!JSON.stringify(result).includes('secret-audiomuse-token'));
});

const calibration = {
  version: 'v3.7.1',
  indexModel: 'fixture-only',
  report: 'synthetic policy test; not live calibration',
  maxDistance: 0.3,
  minDescriptionSimilarity: 0.7,
};

async function ok<T>(
  service: ReturnType<typeof createApp>,
  name: string,
  input: unknown,
): Promise<T> {
  const result = await service.execute(name, input);
  assert.equal(result.status, 'ok', JSON.stringify(result));
  return result.data as T;
}

test('description discovery applies its quality floor, validates library identity, and saves recommendations with provenance', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const config = {
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  };
  const service = createApp(config);
  t.onTestFinished(() => service.close());
  audio.controls.rows = [
    {
      item_id: 'other',
      title: 'Teardrop',
      author: 'Massive Attack',
      similarity: 0.9,
      distance: 0.1,
    },
    {
      item_id: 'studio',
      title: 'Hallelujah',
      author: 'Jeff Buckley',
      similarity: 0.4,
      distance: 0.6,
    },
  ];
  const found = await ok<{
    recommendations: { track: { id: string }; recommendation: object }[];
    shortfall: number;
  }>(service, 'discover_tracks', { description: 'quiet evening', count: 2 });
  assert.deepEqual(
    found.recommendations.map((r) => r.track.id),
    ['other'],
  );
  assert.equal(found.shortfall, 1);
  const draft = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Discovered',
    entries: found.recommendations.map((r) => ({
      request: { title: 'Teardrop', artist: 'Massive Attack' },
      trackId: r.track.id,
      recommendation: r.recommendation,
    })),
  });
  assert.equal(draft.entries[0]?.recommendation?.kind, 'description');
  audio.controls.rows[0]!.author = 'Wrong library';
  assert.equal(
    (await service.execute('discover_tracks', { description: 'evening' })).status,
    'library_changed',
  );
  const uncalibrated = createApp({
    ...config,
    audiomuse: { ...config.audiomuse, calibration: undefined },
  });
  t.onTestFinished(() => uncalibrated.close());
  assert.equal(
    (await uncalibrated.execute('discover_tracks', { description: 'evening' })).status,
    'calibration_required',
  );
});

test('single-track similarity proves reference availability and reports ambiguous failures without claiming missing analysis', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const service = createApp({
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  });
  t.onTestFinished(() => service.close());
  audio.controls.rows = [
    {
      item_id: 'other',
      title: 'Teardrop',
      author: 'Massive Attack',
      similarity: 0.9,
      distance: 0.1,
    },
    {
      item_id: 'live',
      title: 'Hallelujah (Live)',
      author: 'Jeff Buckley',
      similarity: 0.9,
      distance: 0.15,
    },
    {
      item_id: 'studio',
      title: 'Hallelujah',
      author: 'Jeff Buckley',
      similarity: 0.9,
      distance: 0.01,
    },
  ];
  const found = await ok<{
    recommendations: { track: { id: string } }[];
    shortfall: number;
    warnings: string[];
  }>(service, 'find_similar_tracks', { trackId: 'studio', count: 2 });
  assert.deepEqual(
    found.recommendations.map((r) => r.track.id),
    ['other'],
  );
  assert.equal(found.shortfall, 1);
  assert(found.warnings.length > 0);
  audio.controls.analysisFails = true;
  const failure = await service.execute('find_similar_tracks', { trackId: 'studio' });
  assert.equal(failure.status, 'analysis_unavailable');
  assert.deepEqual(failure.details, { trackId: 'studio', availability: 'unknown' });
});

test('expansion balances distinct originals, preserves occurrences, and replays a successful request across restart', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  for (const id of ['a1', 'a2', 'a3', 'b1']) remote.songs.push({ id, title: id, artist: id });
  const row = (id: string) => ({
    item_id: id,
    title: id,
    author: id,
    similarity: 0.9,
    distance: 0.1,
  });
  audio.controls.byReference = { studio: [row('a1'), row('a2'), row('a3')], other: [row('b1')] };
  const config = {
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  };
  let service = createApp(config);
  t.onTestFinished(() => service.close());
  const draft = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Mixed',
    entries: [
      { request: { title: 'Hallelujah', artist: 'Jeff Buckley' }, trackId: 'studio' },
      { request: { title: 'Hallelujah', artist: 'Jeff Buckley' }, trackId: 'studio' },
      { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
      { request: { title: 'Unavailable', artist: 'Nobody' }, omit: true },
    ],
  });
  const request = { draftId: draft.id, revision: 1, requestKey: 'balanced', mode: 'regenerate' };
  const expanded = await ok<{ draft: Draft; target: number; added: number }>(
    service,
    'expand_playlist_draft',
    request,
  );
  assert.equal(expanded.target, 2);
  assert.equal(expanded.added, 2);
  assert.deepEqual(
    expanded.draft.entries.map((e) => e.track?.id ?? 'omitted'),
    ['studio', 'studio', 'other', 'omitted', 'a1', 'b1'],
  );
  service.close();
  service = createApp(config);
  const replay = await ok<typeof expanded>(service, 'expand_playlist_draft', request);
  assert.deepEqual(replay, expanded);
  const more = await ok<typeof expanded>(service, 'expand_playlist_draft', {
    draftId: draft.id,
    revision: 2,
    requestKey: 'more',
    mode: 'add_more',
    count: 3,
  });
  assert.equal(more.added, 2);
  assert.deepEqual(
    more.draft.entries.slice(4).map((e) => e.track?.id),
    ['a1', 'b1', 'a2', 'a3'],
  );
});

test('retained recommendations and explicit reference choices survive regeneration, failure, restart, and copying', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  for (const id of ['a1', 'a2']) remote.songs.push({ id, title: id, artist: id });
  audio.controls.rows = ['a1', 'a2'].map((id) => ({
    item_id: id,
    title: id,
    author: id,
    similarity: 0.9,
    distance: 0.1,
  }));
  const config = {
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  };
  let service = createApp(config);
  t.onTestFinished(() => service.close());
  const original = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Protected',
    entries: [{ request: { title: 'Hallelujah', artist: 'Jeff Buckley' }, trackId: 'studio' }],
  });
  const expanded = await ok<{ draft: Draft }>(service, 'expand_playlist_draft', {
    draftId: original.id,
    revision: 1,
    mode: 'regenerate',
    requestKey: 'initial',
    count: 2,
  });
  const configured = await ok<Draft>(service, 'configure_playlist_discovery', {
    draftId: original.id,
    revision: expanded.draft.revision,
    retainedTrackIds: ['a1'],
    referenceTrackIds: ['studio', 'a1'],
  });
  service.close();
  service = createApp(config);
  audio.controls.analysisFails = true;
  const request = {
    draftId: original.id,
    revision: configured.revision,
    mode: 'regenerate',
    requestKey: 'regenerate',
    count: 1,
  };
  assert.equal(
    (await service.execute('expand_playlist_draft', request)).status,
    'analysis_unavailable',
  );
  assert.deepEqual(
    await ok<Draft>(service, 'get_playlist_draft', { draftId: original.id }),
    configured,
  );
  audio.controls.analysisFails = false;
  const regenerated = await ok<{ draft: Draft }>(service, 'expand_playlist_draft', request);
  assert.deepEqual(
    regenerated.draft.entries.map((e) => e.track?.id),
    ['studio', 'a1', 'a2'],
  );
  assert.equal(regenerated.draft.entries[1]?.recommendation?.retained, true);
  const copied = await ok<Draft>(service, 'copy_playlist_draft', {
    draftId: original.id,
    revision: regenerated.draft.revision,
  });
  assert.deepEqual(copied.referenceTrackIds, ['studio', 'a1']);
  assert.deepEqual(copied.entries, regenerated.draft.entries);
  const preview = await ok<Draft>(service, 'preview_playlist', { draftId: copied.id, revision: 1 });
  assert.equal(preview.entries[1]?.recommendation?.retained, true);
  const published = await ok<{ status: string }>(service, 'publish_playlist', {
    draftId: copied.id,
    revision: 1,
    operationKey: 'publish-discovery',
  });
  assert.equal(published.status, 'succeeded');
  assert.deepEqual(
    remote.playlists[0]?.entry.map((e) => e.id),
    ['studio', 'a1', 'a2'],
  );
});

test('a wrong AudioMuse media-server binding fails before recommendations can be selected', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = 'https://wrong.example';
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const service = createApp({
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  });
  t.onTestFinished(() => service.close());
  assert.equal(
    (await service.execute('discover_tracks', { description: 'jazz' })).status,
    'configuration_error',
  );
});

test('environment configuration enables AudioMuse without embedding credentials in tool arguments', async (t) => {
  const { loadConfig } = await import('../../src/config.ts');
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const calibrationPath = join(remote.directory, 'calibration.json');
  await writeFile(
    calibrationPath,
    JSON.stringify({
      ...calibration,
      audiomuseUrl: audio.url,
      navidromeUrl: remote.config.url,
      server: 'navidrome',
    }),
  );
  const config = loadConfig({
    NAVIDROME_URL: remote.config.url,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret-password',
    NAVIDROME_DB_PATH: remote.config.databasePath,
    AUDIOMUSE_URL: audio.url,
    AUDIOMUSE_API_TOKEN: 'secret-audiomuse-token',
    AUDIOMUSE_SERVER: 'navidrome',
    AUDIOMUSE_CALIBRATION_PATH: calibrationPath,
  });
  const service = createApp(config);
  t.onTestFinished(() => service.close());
  assert.deepEqual(await service.execute('check_audiomuse_connection', {}), {
    status: 'ok',
    data: { connected: true, calibrated: true, version: 'v3.7.1' },
  });
});

test('expansion cannot overwrite a concurrent edit or apply partial additions after its overall deadline', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const config = {
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  };
  const service = createApp(config);
  t.onTestFinished(() => service.close());
  const entries = [{ request: { title: 'Hallelujah', artist: 'Jeff Buckley' }, trackId: 'studio' }];
  const draft = await ok<Draft>(service, 'save_playlist_draft', { name: 'Concurrent', entries });
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const active = new Promise<void>((r) => {
    started = r;
  });
  t.onTestFinished(() => release());
  audio.controls.onSimilarity = async () => {
    started();
    await gate;
  };
  const pending = service.execute('expand_playlist_draft', {
    draftId: draft.id,
    revision: 1,
    requestKey: 'concurrent',
    mode: 'add_more',
  });
  await active;
  const edited = await ok<Draft>(service, 'save_playlist_draft', {
    draftId: draft.id,
    expectedRevision: 1,
    name: 'Edited',
    entries,
  });
  release();
  assert.equal((await pending).status, 'stale_revision');
  assert.deepEqual(await ok<Draft>(service, 'get_playlist_draft', { draftId: draft.id }), edited);
  audio.controls.onSimilarity = () => new Promise((r) => setTimeout(r, 100));
  const timed = createApp({ ...config, audiomuse: { ...config.audiomuse, budgetMs: 20 } });
  t.onTestFinished(() => timed.close());
  assert.equal(
    (
      await timed.execute('expand_playlist_draft', {
        draftId: draft.id,
        revision: 2,
        requestKey: 'timeout',
        mode: 'regenerate',
      })
    ).status,
    'discovery_timeout',
  );
  assert.deepEqual(await ok<Draft>(service, 'get_playlist_draft', { draftId: draft.id }), edited);
});

test('editing a draft preserves recommendation provenance, retention, and still-selected reference choices', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const entries = [
    {
      request: { title: 'Teardrop', artist: 'Massive Attack' },
      trackId: 'other',
      recommendation: { kind: 'description', score: 0.9, retained: true },
    },
  ];
  const original = await ok<Draft>(service, 'save_playlist_draft', { name: 'Original', entries });
  const configured = await ok<Draft>(service, 'configure_playlist_discovery', {
    draftId: original.id,
    revision: 1,
    referenceTrackIds: ['other'],
  });
  const renamed = await ok<Draft>(service, 'save_playlist_draft', {
    draftId: original.id,
    expectedRevision: configured.revision,
    name: 'Renamed',
    entries: entries.map((entry) => ({ request: entry.request, trackId: entry.trackId })),
  });
  assert.deepEqual(renamed.referenceTrackIds, ['other']);
  assert.deepEqual(renamed.entries[0]?.recommendation, configured.entries[0]?.recommendation);
  const released = await ok<Draft>(service, 'save_playlist_draft', {
    draftId: original.id,
    expectedRevision: renamed.revision,
    name: 'Released',
    entries: [
      { ...entries[0], recommendation: { ...entries[0]!.recommendation, retained: false } },
    ],
  });
  assert.deepEqual(released.referenceTrackIds, []);
});

test('empty optional AudioMuse environment settings preserve explicit-list operation', async (t) => {
  const { loadConfig } = await import('../../src/config.ts');
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(
    loadConfig({
      NAVIDROME_URL: remote.config.url,
      NAVIDROME_USERNAME: 'tester',
      NAVIDROME_PASSWORD: 'secret-password',
      NAVIDROME_DB_PATH: remote.config.databasePath,
      AUDIOMUSE_URL: '',
      AUDIOMUSE_API_TOKEN: '',
      AUDIOMUSE_SERVER: '',
      AUDIOMUSE_CALIBRATION_PATH: '',
    }),
  );
  t.onTestFinished(() => service.close());
  assert.equal((await service.execute('check_connection', {})).status, 'ok');
  assert.equal(
    (await service.execute('check_audiomuse_connection', {})).status,
    'audiomuse_unavailable',
  );
});

test('unresolved originals block expansion, explicit reference exclusion keeps originals, and capacity reports a shortfall', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const service = createApp({
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  });
  t.onTestFinished(() => service.close());
  const unresolved = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Unresolved',
    entries: [{ request: { title: 'Unknown', artist: 'Nobody' } }],
  });
  assert.equal(
    (
      await service.execute('expand_playlist_draft', {
        draftId: unresolved.id,
        revision: 1,
        requestKey: 'unresolved',
        mode: 'regenerate',
      })
    ).status,
    'unresolved_songs',
  );
  const originalEntry = {
    request: { title: 'Hallelujah', artist: 'Jeff Buckley' },
    trackId: 'studio',
  };
  const draft = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Capacity',
    entries: [
      ...Array.from({ length: 498 }, () => originalEntry),
      { request: { title: 'Teardrop', artist: 'Massive Attack' }, trackId: 'other' },
    ],
  });
  const configured = await ok<Draft>(service, 'configure_playlist_discovery', {
    draftId: draft.id,
    revision: 1,
    referenceTrackIds: ['studio'],
  });
  audio.controls.rows = [
    {
      item_id: 'live',
      title: 'Hallelujah (Live)',
      author: 'Jeff Buckley',
      similarity: 0.9,
      distance: 0.1,
    },
  ];
  const result = await ok<{
    draft: Draft;
    added: number;
    shortfall: number;
    capacityLimited: boolean;
  }>(service, 'expand_playlist_draft', {
    draftId: draft.id,
    revision: configured.revision,
    requestKey: 'capacity',
    mode: 'add_more',
    count: 100,
    allowAlternateVersions: true,
  });
  assert.equal(result.draft.entries.length, 500);
  assert.equal(result.draft.entries[498]?.track?.id, 'other');
  assert.equal(result.added, 1);
  assert.equal(result.shortfall, 99);
  assert.equal(result.capacityLimited, true);
  assert.equal(
    (
      await service.execute('expand_playlist_draft', {
        draftId: draft.id,
        revision: configured.revision,
        requestKey: 'capacity',
        mode: 'add_more',
        count: 99,
        allowAlternateVersions: true,
      })
    ).status,
    'operation_key_conflict',
  );
});

test('a previously recommended recording can be explicitly made a supplied song', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const service = createApp(remote.config);
  t.onTestFinished(() => service.close());
  const request = { title: 'Teardrop', artist: 'Massive Attack' };
  const draft = await ok<Draft>(service, 'save_playlist_draft', {
    name: 'Recommended',
    entries: [{ request, trackId: 'other', recommendation: { kind: 'description', score: 0.9 } }],
  });
  const supplied = await ok<Draft>(service, 'save_playlist_draft', {
    draftId: draft.id,
    expectedRevision: 1,
    name: 'Supplied',
    entries: [{ request, trackId: 'other', recommendation: null }],
  });
  assert.equal(supplied.entries[0]?.recommendation, undefined);
});

test('AudioMuse connectivity shares one budget across version and server-binding checks', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  const service = createApp({
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 400,
    },
  });
  t.onTestFinished(() => service.close());
  audio.controls.onVersion = audio.controls.onServers = () =>
    new Promise((r) => setTimeout(r, 250));
  assert.equal(
    (await service.execute('check_audiomuse_connection', {})).status,
    'discovery_timeout',
  );
});

test('update discovery uses reference-only songs and excludes the target without appending examples', async (t) => {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  remote.playlists.push({
    id: 'target',
    name: 'Existing',
    public: false,
    entry: [remote.songs[1]!],
  });
  audio.controls.rows = remote.songs.map((s) => ({
    item_id: s.id,
    title: s.title,
    author: s.artist,
    similarity: 0.9,
    distance: 0.1,
  }));
  const app = createApp({
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
      calibration,
    },
  });
  t.onTestFinished(() => app.close());
  const draft = await ok<Draft>(app, 'save_playlist_update', {
    playlistId: 'target',
    entries: [],
    references: [{ request: { title: 'Hallelujah', artist: 'Jeff Buckley' }, trackId: 'studio' }],
  });
  const expanded = await ok<{ draft: Draft; added: number }>(app, 'expand_playlist_update', {
    draftId: draft.id,
    revision: 1,
    mode: 'regenerate',
    requestKey: 'update-discovery',
  });
  assert.equal(expanded.added, 1);
  assert.deepEqual(
    expanded.draft.entries.map((e) => e.track?.id),
    ['other'],
  );
  await ok(app, 'preview_playlist_update', { draftId: draft.id, revision: 2 });
  const operation = await ok<{ status: string }>(app, 'apply_playlist_update', {
    draftId: draft.id,
    revision: 2,
    operationKey: 'apply-discovery',
  });
  assert.equal(operation.status, 'succeeded');
  assert.deepEqual(
    remote.playlists[0]!.entry.map((s) => s.id),
    ['live', 'other'],
  );
});
