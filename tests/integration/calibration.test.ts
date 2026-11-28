import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Storage } from '../../src/database/storage.ts';
import { navidromeFixture } from '../support/navidrome.ts';
import { audioMuseFixture } from '../support/audiomuse.ts';
import { createApp } from '../../src/app.ts';
import { Problem } from '../../src/playlists/domain.ts';
import type { CalibrationBinding, CalibrationScale } from '../../src/playlists/domain.ts';

/** A Navidrome and AudioMuse pair with AudioMuse configured but not yet calibrated. */
async function discoveryFixture(t: { onTestFinished(fn: () => unknown): void }) {
  const remote = await navidromeFixture();
  const audio = await audioMuseFixture();
  audio.controls.navidromeUrl = remote.config.url;
  t.onTestFinished(async () => {
    await remote.close();
    await audio.close();
  });
  audio.controls.rows = [
    {
      item_id: 'other',
      title: 'Teardrop',
      author: 'Massive Attack',
      similarity: 0.8,
      distance: 0.2,
    },
  ];
  const config = {
    ...remote.config,
    audiomuse: {
      url: audio.url,
      token: 'secret-audiomuse-token',
      server: 'navidrome',
      budgetMs: 60000,
    },
  };
  const live: CalibrationBinding = {
    audiomuseUrl: audio.url,
    server: 'navidrome',
    navidromeUrl: remote.config.url,
    release: 'v3.7.4',
  };
  /** Saves calibrations through storage before the service starts, as a later session would. */
  const seed = (
    saves: { scale: CalibrationScale; cutoff: number; binding?: Partial<CalibrationBinding> }[],
    reset: CalibrationScale[] = [],
  ) => {
    const storage = new Storage(config);
    for (const save of saves)
      storage.saveCalibration({ ...save, binding: { ...live, ...save.binding } });
    for (const scale of reset) storage.resetCalibration(scale);
    storage.close();
  };
  const start = () => {
    const service = createApp(config);
    t.onTestFinished(() => service.close());
    return service;
  };
  return { remote, audio, config, seed, start };
}

const similar = { trackId: 'studio', count: 1 };
const describe = { description: 'quiet evening', count: 1 };

test('discovery requires a calibration for each scale it uses, and scales are calibrated independently', async (t) => {
  const { seed, start } = await discoveryFixture(t);
  const uncalibrated = start();
  for (const [scale, tool, input] of [
    ['similarity', 'find_similar_tracks', similar],
    ['description', 'discover_tracks', describe],
  ] as const)
    assert.deepEqual(await uncalibrated.execute(tool, input), {
      status: 'calibration_required',
      message: `Calibrate the ${scale} scale before using it for recommendations.`,
      details: { scale, reason: 'missing' },
    });
  uncalibrated.close();

  seed([{ scale: 'similarity', cutoff: 0.3 }]);
  const service = start();
  const found = await service.execute('find_similar_tracks', similar);
  assert.equal(found.status, 'ok', JSON.stringify(found));
  assert.equal((await service.execute('discover_tracks', describe)).status, 'calibration_required');
});

test('discovery applies each stored cutoff inclusively', async (t) => {
  const { seed, start } = await discoveryFixture(t);
  seed([
    { scale: 'similarity', cutoff: 0.2 },
    { scale: 'description', cutoff: 0.8 },
  ]);
  const service = start();
  for (const [tool, input] of [
    ['find_similar_tracks', similar],
    ['discover_tracks', describe],
  ] as const) {
    const result = await service.execute(tool, input);
    assert.equal(result.status, 'ok', JSON.stringify(result));
    assert.equal((result.data as { recommendations: unknown[] }).recommendations.length, 1);
  }
  const stricter = await discoveryFixture(t);
  stricter.seed([
    { scale: 'similarity', cutoff: 0.19 },
    { scale: 'description', cutoff: 0.81 },
  ]);
  const strict = stricter.start();
  for (const [tool, input] of [
    ['find_similar_tracks', similar],
    ['discover_tracks', describe],
  ] as const) {
    const result = await strict.execute(tool, input);
    assert.equal((result.data as { shortfall: number }).shortfall, 1);
  }
});

const status = async (service: ReturnType<typeof createApp>) => {
  const result = await service.execute('check_audiomuse_connection', {});
  assert.equal(result.status, 'ok', JSON.stringify(result));
  return result.data!.calibration;
};

test('connection status reports each scale as missing, calibrated with its cutoff, or stale with its reasons', async (t) => {
  const { seed, start } = await discoveryFixture(t);
  const before = start();
  assert.deepEqual(await before.execute('check_audiomuse_connection', {}), {
    status: 'ok',
    data: {
      connected: true,
      version: 'v3.7.4',
      calibration: { similarity: { state: 'missing' }, description: { state: 'missing' } },
    },
  });
  before.close();
  seed([
    { scale: 'similarity', cutoff: 0.3 },
    { scale: 'description', cutoff: 0.7, binding: { server: 'jellyfin' } },
  ]);
  assert.deepEqual(await status(start()), {
    similarity: { state: 'calibrated', cutoff: 0.3 },
    description: { state: 'stale', cutoff: 0.7, changes: ['server'] },
  });
});

test('a calibration is stale when a bound field or the minor release changes, but not on a patch release', async (t) => {
  const cases: [Partial<CalibrationBinding>, string[]][] = [
    [{ audiomuseUrl: 'http://elsewhere.test' }, ['audiomuseUrl']],
    [{ server: 'jellyfin' }, ['server']],
    [{ navidromeUrl: 'http://other-navidrome.test' }, ['navidromeUrl']],
    [{ release: 'v3.6.9' }, ['release']],
    [{ server: 'jellyfin', release: 'v3.6.9' }, ['server', 'release']],
  ];
  for (const [binding, changes] of cases) {
    const { seed, start } = await discoveryFixture(t);
    seed([{ scale: 'similarity', cutoff: 0.3, binding }]);
    const service = start();
    assert.deepEqual(await service.execute('find_similar_tracks', similar), {
      status: 'calibration_required',
      message:
        'The similarity calibration is stale for this deployment; recalibrate the similarity scale.',
      details: { scale: 'similarity', reason: 'stale', changes },
    });
    assert.deepEqual((await status(service)).similarity, { state: 'stale', cutoff: 0.3, changes });
  }
  const { seed, start, audio } = await discoveryFixture(t);
  seed([{ scale: 'similarity', cutoff: 0.3, binding: { release: 'v3.7.1' } }]);
  audio.controls.version = 'v3.7.9';
  const service = start();
  assert.equal((await service.execute('find_similar_tracks', similar)).status, 'ok');
  assert.deepEqual((await status(service)).similarity, { state: 'calibrated', cutoff: 0.3 });
});

test('resetting a scale makes it stale until recalibrated, keeping its ratings as history', async (t) => {
  const { seed, start, config } = await discoveryFixture(t);
  const storage = new Storage(config);
  storage.recordCalibrationRatings('description', [
    {
      probe: 'rainy day',
      trackId: 'other',
      title: 'Teardrop',
      artist: 'Massive Attack',
      score: 0.8,
      rating: 'good',
    },
  ]);
  storage.close();
  seed([
    { scale: 'similarity', cutoff: 0.3 },
    { scale: 'description', cutoff: 0.7 },
  ]);
  const service = start();
  const reset = await service.execute('reset_calibration', { scale: 'description' });
  assert.equal(reset.status, 'ok', JSON.stringify(reset));
  assert(reset.data?.state === 'stale');
  const { resetAt, ...rest } = reset.data;
  assert.deepEqual(rest, { scale: 'description', state: 'stale', cutoff: 0.7 });
  assert.equal(typeof resetAt, 'string');
  assert.equal((await service.execute('find_similar_tracks', similar)).status, 'ok');
  const stale = await service.execute('discover_tracks', describe);
  assert(stale.status !== 'ok');
  assert.deepEqual(stale.details, { scale: 'description', reason: 'stale', changes: ['reset'] });
  assert.deepEqual(await status(service), {
    similarity: { state: 'calibrated', cutoff: 0.3 },
    description: { state: 'stale', cutoff: 0.7, changes: ['reset'] },
  });
  service.close();

  seed([{ scale: 'description', cutoff: 0.75 }]);
  const recalibrated = start();
  assert.equal((await recalibrated.execute('discover_tracks', describe)).status, 'ok');
  assert.deepEqual((await status(recalibrated)).description, { state: 'calibrated', cutoff: 0.75 });
  recalibrated.close();
  const history = new Storage(config);
  t.onTestFinished(() => history.close());
  const [current, previous] = history.calibrationHistory('description');
  assert.equal(current?.cutoff, 0.75);
  assert.equal(previous?.resetAt, resetAt);
  assert.deepEqual(
    history.calibrationRatings('description', previous!.epoch).map((r) => r.probe),
    ['rainy day'],
  );
});

test('resetting an uncalibrated scale reports it missing', async (t) => {
  const { start } = await discoveryFixture(t);
  assert.deepEqual(await start().execute('reset_calibration', { scale: 'similarity' }), {
    status: 'ok',
    data: { scale: 'similarity', state: 'missing' },
  });
  assert.equal(
    (await start().execute('reset_calibration', { scale: 'tempo' })).status,
    'invalid_input',
  );
});

const binding = {
  audiomuseUrl: 'http://audiomuse.test',
  server: 'navidrome',
  navidromeUrl: 'http://navidrome.test',
  release: 'v3.7.4',
};

test('a saved calibration is current for its scale only and persists across restart with its history', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const storage = new Storage(remote.config);
  assert.equal(storage.currentCalibration('similarity'), undefined);
  const first = storage.saveCalibration({ scale: 'similarity', cutoff: 0.3, binding });
  assert.equal(first.cutoff, 0.3);
  assert.deepEqual(first.binding, { ...binding, minor: '3.7' });
  const second = storage.saveCalibration({
    scale: 'similarity',
    cutoff: 0.25,
    binding,
    note: 'Moved from calibration file',
  });
  storage.close();

  const reopened = new Storage(remote.config);
  t.onTestFinished(() => reopened.close());
  assert.deepEqual(reopened.currentCalibration('similarity'), second);
  assert.equal(second.note, 'Moved from calibration file');
  assert.equal(reopened.currentCalibration('description'), undefined);
  assert.deepEqual(
    reopened.calibrationHistory('similarity').map((c) => c.cutoff),
    [0.25, 0.3],
  );
});

const rating = (probe: string, trackId: string, score: number, verdict: 'good' | 'poor') => ({
  probe,
  trackId,
  title: `Title ${trackId}`,
  artist: 'Artist',
  score,
  rating: verdict,
});

test('ratings collect per scale until a save, and recalibration starts fresh ratings while keeping history', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const storage = new Storage(remote.config);
  t.onTestFinished(() => storage.close());
  storage.recordCalibrationRatings('similarity', [
    rating('studio', 'a', 0.1, 'good'),
    rating('studio', 'b', 0.5, 'good'),
  ]);
  storage.recordCalibrationRatings('similarity', [rating('studio', 'b', 0.5, 'poor')]);
  storage.recordCalibrationRatings('description', [rating('rainy day', 'c', 0.8, 'good')]);
  assert.deepEqual(storage.calibrationRatings('similarity'), [
    rating('studio', 'a', 0.1, 'good'),
    rating('studio', 'b', 0.5, 'poor'),
  ]);
  assert.deepEqual(storage.calibrationRatings('description'), [
    rating('rainy day', 'c', 0.8, 'good'),
  ]);

  const saved = storage.saveCalibration({ scale: 'similarity', cutoff: 0.1, binding });
  assert.deepEqual(storage.calibrationRatings('similarity'), []);
  storage.recordCalibrationRatings('similarity', [rating('other', 'd', 0.2, 'good')]);
  assert.deepEqual(storage.calibrationRatings('similarity'), [rating('other', 'd', 0.2, 'good')]);
  assert.deepEqual(storage.calibrationRatings('similarity', saved.epoch), [
    rating('studio', 'a', 0.1, 'good'),
    rating('studio', 'b', 0.5, 'poor'),
  ]);
  assert.deepEqual(storage.calibrationRatings('description'), [
    rating('rainy day', 'c', 0.8, 'good'),
  ]);
});

test('a reset marks only that scale stale and starts fresh ratings', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const storage = new Storage(remote.config);
  t.onTestFinished(() => storage.close());
  assert.equal(storage.resetCalibration('similarity'), undefined);
  storage.saveCalibration({ scale: 'similarity', cutoff: 0.3, binding });
  storage.saveCalibration({ scale: 'description', cutoff: 0.7, binding });
  storage.recordCalibrationRatings('similarity', [rating('studio', 'a', 0.1, 'good')]);
  const reset = storage.resetCalibration('similarity');
  assert(reset?.resetAt);
  assert.deepEqual(storage.currentCalibration('similarity'), reset);
  assert.equal(storage.currentCalibration('description')?.resetAt, undefined);
  assert.deepEqual(storage.calibrationRatings('similarity'), []);
  const fresh = storage.saveCalibration({ scale: 'similarity', cutoff: 0.2, binding });
  assert.equal(fresh.resetAt, undefined);
  assert.equal(storage.calibrationHistory('similarity')[1]?.resetAt, reset.resetAt);
});

test('calibration belongs to the persisted identity: another account or server cannot open it', async (t) => {
  const { seed, start, config } = await discoveryFixture(t);
  seed([{ scale: 'similarity', cutoff: 0.3 }]);
  for (const other of [
    { ...config, username: 'someone-else' },
    { ...config, url: 'http://other-navidrome.test' },
  ])
    assert.throws(
      () => createApp(other),
      (error: unknown) => error instanceof Problem && error.code === 'configuration_error',
    );
  assert.equal((await start().execute('find_similar_tracks', similar)).status, 'ok');
});

test('a calibration with a malformed release is refused as a problem', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const storage = new Storage(remote.config);
  t.onTestFinished(() => storage.close());
  assert.throws(
    () =>
      storage.saveCalibration({
        scale: 'similarity',
        cutoff: 0.3,
        binding: { ...binding, release: 'nightly' },
      }),
    (error: unknown) => error instanceof Problem && error.code === 'audiomuse_error',
  );
  assert.equal(storage.currentCalibration('similarity'), undefined);
});

test('a ratings save checks its evidence inside the save transaction, saving nothing when refused', async (t) => {
  const remote = await navidromeFixture();
  t.onTestFinished(() => remote.close());
  const storage = new Storage(remote.config);
  t.onTestFinished(() => storage.close());
  storage.recordCalibrationRatings('similarity', [rating('studio', 'a', 0.1, 'good')]);
  // Another client sharing the database records a rating before this save.
  const other = new Storage(remote.config);
  other.recordCalibrationRatings('similarity', [rating('studio', 'b', 0.5, 'poor')]);
  other.close();
  let evidence: unknown;
  assert.throws(
    () =>
      storage.saveCalibration({
        scale: 'similarity',
        cutoff: 0.1,
        binding,
        verify: (ratings) => {
          evidence = ratings;
          throw new Problem('invalid_input', 'The proposal changed.');
        },
      }),
    Problem,
  );
  assert.deepEqual(evidence, [
    rating('studio', 'a', 0.1, 'good'),
    rating('studio', 'b', 0.5, 'poor'),
  ]);
  assert.equal(storage.currentCalibration('similarity'), undefined);
  assert.equal(storage.calibrationRatings('similarity').length, 2);
});
