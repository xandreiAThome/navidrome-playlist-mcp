import { test } from 'vitest';
import assert from 'node:assert/strict';
import { navidromeFixture } from '../support/navidrome.ts';
import { audioMuseFixture } from '../support/audiomuse.ts';
import { createApp } from '../../src/app.ts';

/** An uncalibrated deployment: calibration tools must work before any cutoff exists. */
async function uncalibrated(t: { onTestFinished(fn: () => unknown): void }) {
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
    },
  };
  const service = createApp(config);
  t.onTestFinished(() => service.close());
  return { audio, service };
}

const row = (item_id: string, title: string, author: string, score: number) => ({
  item_id,
  title,
  author,
  distance: score,
  similarity: score,
});
const live = row('live', 'Hallelujah (Live)', 'Jeff Buckley', 0.15);
const teardrop = row('other', 'Teardrop', 'Massive Attack', 0.4);

test('collects validated candidates with raw distances for a probe track, excluding the probe', async (t) => {
  const { audio, service } = await uncalibrated(t);
  audio.controls.byReference.studio = [
    teardrop,
    row('studio', 'Hallelujah', 'Jeff Buckley', 0),
    live,
  ];
  const result = await service.execute('collect_calibration_candidates', {
    scale: 'similarity',
    probe: 'studio',
  });
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.deepEqual(
    result.data.candidates.map((c) => [c.track.id, c.score]),
    [
      ['live', 0.15],
      ['other', 0.4],
    ],
  );
  assert.equal(result.data.nextOffset, undefined);
});

test('collects further down the list a page at a time, up to the end of the list', async (t) => {
  const { audio, service } = await uncalibrated(t);
  audio.controls.byReference.studio = [
    row('studio', 'Hallelujah', 'Jeff Buckley', 0),
    live,
    teardrop,
  ];
  const first = await service.execute('collect_calibration_candidates', {
    scale: 'similarity',
    probe: 'studio',
    count: 1,
  });
  assert.equal(first.status, 'ok', JSON.stringify(first));
  assert.deepEqual(
    first.data.candidates.map((c) => c.track.id),
    ['live'],
  );
  assert.equal(first.data.nextOffset, 1);
  const further = await service.execute('collect_calibration_candidates', {
    scale: 'similarity',
    probe: 'studio',
    offset: first.data.nextOffset,
    count: 1,
  });
  assert.equal(further.status, 'ok', JSON.stringify(further));
  assert.deepEqual(
    further.data.candidates.map((c) => [c.track.id, c.score]),
    [['other', 0.4]],
  );
  assert.equal(further.data.offset, 1);
  assert.equal(further.data.nextOffset, undefined);
});

test('collects candidates with raw similarities for a probe description, most similar first', async (t) => {
  const { audio, service } = await uncalibrated(t);
  audio.controls.byQuery['rainy evening'] = [
    row('other', 'Teardrop', 'Massive Attack', 0.31),
    row('live', 'Hallelujah (Live)', 'Jeff Buckley', 0.42),
  ];
  const result = await service.execute('collect_calibration_candidates', {
    scale: 'description',
    probe: 'rainy evening',
  });
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.deepEqual(
    result.data.candidates.map((c) => [c.track.id, c.score]),
    [
      ['live', 0.42],
      ['other', 0.31],
    ],
  );
  assert.equal(result.data.probe, 'rainy evening');
});

test('a candidate that does not match the library fails collection rather than being offered', async (t) => {
  const { audio, service } = await uncalibrated(t);
  audio.controls.rows = [row('other', 'Unfinished Sympathy', 'Massive Attack', 0.5)];
  const result = await service.execute('collect_calibration_candidates', {
    scale: 'description',
    probe: 'rainy evening',
  });
  assert.equal(result.status, 'library_changed');
  assert.deepEqual(result.details, { trackId: 'other' });
});

test('records good and poor ratings per scale as evidence, a re-rating replacing the earlier one', async (t) => {
  const { service } = await uncalibrated(t);
  const rate = (scale: 'similarity' | 'description', probe: string, ratings: unknown[]) =>
    service.execute('record_calibration_ratings', { scale, probe, ratings });
  const liveGood = {
    trackId: 'live',
    title: 'Hallelujah (Live)',
    artist: 'Jeff Buckley',
    score: 0.15,
    rating: 'good',
  };
  const teardropPoor = {
    trackId: 'other',
    title: 'Teardrop',
    artist: 'Massive Attack',
    score: 0.4,
    rating: 'poor',
  };
  assert.equal((await rate('similarity', 'studio', [liveGood, teardropPoor])).status, 'ok');
  await rate('description', 'rainy evening', [{ ...teardropPoor, score: 0.31, rating: 'good' }]);
  const rerated = await rate('similarity', 'studio', [{ ...liveGood, rating: 'poor' }]);
  assert.equal(rerated.status, 'ok', JSON.stringify(rerated));
  assert.deepEqual(rerated.data, {
    scale: 'similarity',
    ratings: [
      {
        probe: 'studio',
        trackId: 'live',
        title: 'Hallelujah (Live)',
        artist: 'Jeff Buckley',
        score: 0.15,
        rating: 'poor',
      },
      {
        probe: 'studio',
        trackId: 'other',
        title: 'Teardrop',
        artist: 'Massive Attack',
        score: 0.4,
        rating: 'poor',
      },
    ],
  });
  assert.equal(
    (await rate('similarity', 'studio', [{ ...liveGood, rating: 'great' }])).status,
    'invalid_input',
  );
});
