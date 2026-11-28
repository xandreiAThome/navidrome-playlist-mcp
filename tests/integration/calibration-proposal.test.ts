import { test } from 'vitest';
import assert from 'node:assert/strict';
import { navidromeFixture } from '../support/navidrome.ts';
import { audioMuseFixture } from '../support/audiomuse.ts';
import { createApp } from '../../src/app.ts';
import type { CalibrationScale } from '../../src/playlists/domain.ts';

/** An uncalibrated deployment whose service can be restarted on the same database. */
async function uncalibrated(t: { onTestFinished(fn: () => unknown): void }) {
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
  const start = (url = audio.url) => {
    const service = createApp({ ...config, audiomuse: { ...config.audiomuse, url } });
    t.onTestFinished(() => service.close());
    return service;
  };
  return { audio, remote, start, service: start() };
}

type Service = ReturnType<typeof createApp>;
type Rated = [trackId: string, score: number, rating: 'good' | 'poor'];

async function rate(service: Service, scale: CalibrationScale, probe: string, rated: Rated[]) {
  const result = await service.execute('record_calibration_ratings', {
    scale,
    probe,
    ratings: rated.map(([trackId, score, rating]) => ({
      trackId,
      title: `Title ${trackId}`,
      artist: 'Artist',
      score,
      rating,
    })),
  });
  assert.equal(result.status, 'ok', JSON.stringify(result));
}

async function propose(service: Service, scale: CalibrationScale) {
  const result = await service.execute('propose_calibration', { scale });
  assert.equal(result.status, 'ok', JSON.stringify(result));
  return result.data!;
}

test('a proposal needs ratings across at least three probes', async (t) => {
  const { service } = await uncalibrated(t);
  await rate(service, 'similarity', 'p1', [
    ['a', 0.1, 'good'],
    ['b', 0.5, 'poor'],
  ]);
  await rate(service, 'similarity', 'p2', [['c', 0.2, 'good']]);
  const proposal = await propose(service, 'similarity');
  assert.equal(proposal.state, 'insufficient');
  assert.deepEqual(proposal.needs, ['probes']);
  assert.deepEqual([proposal.probes, proposal.good, proposal.poor], [2, 2, 1]);
  assert.match(proposal.message, /further down the list|another probe/);
});

test('a proposal needs a poor rating to bound the cutoff', async (t) => {
  const { service } = await uncalibrated(t);
  for (const probe of ['p1', 'p2', 'p3'])
    await rate(service, 'similarity', probe, [[probe, 0.1, 'good']]);
  const proposal = await propose(service, 'similarity');
  assert.equal(proposal.state, 'insufficient');
  assert.deepEqual(proposal.needs, ['poor']);
});

const ids = (ratings: { trackId: string }[]) => ratings.map((r) => r.trackId);

test('the similarity cutoff is the largest good distance below the smallest poor distance', async (t) => {
  const { service } = await uncalibrated(t);
  await rate(service, 'similarity', 'p1', [
    ['a', 0.1, 'good'],
    ['b', 0.3, 'poor'],
  ]);
  await rate(service, 'similarity', 'p2', [
    ['c', 0.25, 'good'],
    ['d', 0.4, 'good'],
  ]);
  await rate(service, 'similarity', 'p3', [['e', 0.35, 'poor']]);
  const proposal = await propose(service, 'similarity');
  assert.equal(proposal.state, 'proposed', JSON.stringify(proposal));
  assert.equal(proposal.cutoff, 0.25);
  assert.deepEqual([proposal.probes, proposal.good, proposal.poor], [3, 3, 2]);
  assert.deepEqual(ids(proposal.accepted), ['a', 'c']);
  assert.deepEqual(ids(proposal.rejected), ['b', 'e', 'd']);
});

test('the description cutoff is the smallest good similarity above the largest poor similarity', async (t) => {
  const { service } = await uncalibrated(t);
  await rate(service, 'description', 'rainy evening', [
    ['a', 0.5, 'good'],
    ['b', 0.3, 'poor'],
  ]);
  await rate(service, 'description', 'upbeat run', [
    ['c', 0.35, 'good'],
    ['d', 0.2, 'good'],
  ]);
  await rate(service, 'description', 'late night drive', [['e', 0.25, 'poor']]);
  const proposal = await propose(service, 'description');
  assert.equal(proposal.state, 'proposed', JSON.stringify(proposal));
  assert.equal(proposal.cutoff, 0.35);
  assert.deepEqual(ids(proposal.accepted), ['a', 'c']);
  assert.deepEqual(ids(proposal.rejected), ['b', 'e', 'd']);
});

test('a good rating tied with a poor rating is rejected, because cutoffs are inclusive', async (t) => {
  const { service } = await uncalibrated(t);
  await rate(service, 'similarity', 'p1', [
    ['a', 0.1, 'good'],
    ['b', 0.2, 'good'],
  ]);
  await rate(service, 'similarity', 'p2', [['c', 0.2, 'poor']]);
  await rate(service, 'similarity', 'p3', [['d', 0.15, 'good']]);
  const proposal = await propose(service, 'similarity');
  assert.equal(proposal.state, 'proposed', JSON.stringify(proposal));
  assert.equal(proposal.cutoff, 0.15);
  assert.deepEqual(ids(proposal.rejected), ['b', 'c']);
});

test('interleaved ratings with no good rating closer than every poor rating need more evidence', async (t) => {
  const { service } = await uncalibrated(t);
  await rate(service, 'description', 'd1', [['a', 0.4, 'poor']]);
  await rate(service, 'description', 'd2', [['b', 0.4, 'good']]);
  await rate(service, 'description', 'd3', [
    ['c', 0.3, 'good'],
    ['d', 0.2, 'poor'],
  ]);
  const proposal = await propose(service, 'description');
  assert.equal(proposal.state, 'insufficient');
  assert.deepEqual(proposal.needs, ['separation']);
  assert.match(proposal.message, /further down the list/);
});

/** Rates three probes so the similarity proposal is 0.2. */
async function rateSimilarity(service: Service) {
  await rate(service, 'similarity', 'p1', [
    ['a', 0.2, 'good'],
    ['b', 0.5, 'poor'],
  ]);
  await rate(service, 'similarity', 'p2', [['c', 0.1, 'good']]);
  await rate(service, 'similarity', 'p3', [['d', 0.3, 'poor']]);
}

test('proposing is read-only; saving the proposed cutoff calibrates only that scale, across restart', async (t) => {
  const { service, start } = await uncalibrated(t);
  await rateSimilarity(service);
  assert.equal((await propose(service, 'similarity')).state, 'proposed');
  const before = await service.execute('check_audiomuse_connection', {});
  assert.deepEqual(before.data!.calibration.similarity, { state: 'missing' });

  const saved = await service.execute('save_calibration', {
    scale: 'similarity',
    cutoff: 0.2,
    evidence: 'ratings',
  });
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  assert.equal(saved.data!.state, 'calibrated');
  assert.equal(saved.data!.cutoff, 0.2);
  assert.equal(saved.data!.note, undefined);
  assert.match(saved.data!.suggestion, /Optionally.*not rated/);
  service.close();

  const restarted = start();
  const status = await restarted.execute('check_audiomuse_connection', {});
  assert.deepEqual(status.data!.calibration, {
    similarity: { state: 'calibrated', cutoff: 0.2 },
    description: { state: 'missing' },
  });
  const found = await restarted.execute('find_similar_tracks', { trackId: 'studio', count: 1 });
  assert.equal(found.status, 'ok', JSON.stringify(found));
  assert.equal(found.data!.recommendations.length, 1);
  const described = await restarted.execute('discover_tracks', { description: 'x', count: 1 });
  assert.equal(described.status, 'calibration_required');
  const fresh = await propose(restarted, 'similarity');
  assert.deepEqual([fresh.state, fresh.probes], ['insufficient', 0]);
});

test('saving from ratings accepts only the current proposal', async (t) => {
  const { service } = await uncalibrated(t);
  const early = await service.execute('save_calibration', {
    scale: 'similarity',
    cutoff: 0.2,
    evidence: 'ratings',
  });
  assert.equal(early.status, 'invalid_input');
  assert.deepEqual(early.details, {
    scale: 'similarity',
    proposal: { state: 'insufficient', needs: ['probes', 'good', 'poor'] },
  });
  await rateSimilarity(service);
  const other = await service.execute('save_calibration', {
    scale: 'similarity',
    cutoff: 0.25,
    evidence: 'ratings',
  });
  assert.equal(other.status, 'invalid_input');
  const status = await service.execute('check_audiomuse_connection', {});
  assert.deepEqual(status.data!.calibration.similarity, { state: 'missing' });
});

test('an explicit cutoff is saved with a recorded note instead of ratings', async (t) => {
  const { service } = await uncalibrated(t);
  for (const input of [
    { scale: 'description', cutoff: 0.3, evidence: 'note' },
    { scale: 'description', cutoff: 0.3, evidence: 'ratings', note: 'From file' },
    { scale: 'similarity', cutoff: -0.1, evidence: 'note', note: 'From file' },
  ])
    assert.equal((await service.execute('save_calibration', input)).status, 'invalid_input');
  const saved = await service.execute('save_calibration', {
    scale: 'description',
    cutoff: 0.3,
    evidence: 'note',
    note: 'Moved from the calibration file',
  });
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  assert.equal(saved.data!.note, 'Moved from the calibration file');
  const status = await service.execute('check_audiomuse_connection', {});
  assert.deepEqual(status.data!.calibration, {
    similarity: { state: 'missing' },
    description: { state: 'calibrated', cutoff: 0.3 },
  });
});

test('a saved calibration is bound to the live deployment', async (t) => {
  const { audio, service, start } = await uncalibrated(t);
  audio.controls.version = 'v3.7.9';
  const saved = await service.execute('save_calibration', {
    scale: 'similarity',
    cutoff: 0.2,
    evidence: 'note',
    note: 'Measured by hand',
  });
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  service.close();
  // The same AudioMuse reached through another URL is a different binding.
  const elsewhere = audio.url.replace('127.0.0.1', 'localhost');
  for (const [url, version, expected] of [
    [audio.url, 'v3.7.4', { state: 'calibrated', cutoff: 0.2 }],
    [elsewhere, 'v3.7.9', { state: 'stale', cutoff: 0.2, changes: ['audiomuseUrl'] }],
  ] as const) {
    audio.controls.version = version;
    const status = await start(url).execute('check_audiomuse_connection', {});
    assert.equal(status.status, 'ok', JSON.stringify(status));
    assert.deepEqual(status.data!.calibration.similarity, expected);
  }
});

test('a note save leaves ratings in progress counting toward the next proposal', async (t) => {
  const { service } = await uncalibrated(t);
  await rateSimilarity(service);
  const saved = await service.execute('save_calibration', {
    scale: 'similarity',
    cutoff: 0.25,
    evidence: 'note',
    note: 'Measured by hand',
  });
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  const proposal = await propose(service, 'similarity');
  assert.equal(proposal.state, 'proposed', JSON.stringify(proposal));
  assert.deepEqual([proposal.cutoff, proposal.probes], [0.2, 3]);
  const replaced = await service.execute('save_calibration', {
    scale: 'similarity',
    cutoff: 0.2,
    evidence: 'ratings',
  });
  assert.equal(replaced.status, 'ok', JSON.stringify(replaced));
  assert.equal((await propose(service, 'similarity')).probes, 0);
});

test('resetting a never-saved scale leaves ratings in progress counting toward its proposal', async (t) => {
  const { service } = await uncalibrated(t);
  await rateSimilarity(service);
  const reset = await service.execute('reset_calibration', { scale: 'similarity' });
  assert.deepEqual(reset, { status: 'ok', data: { scale: 'similarity', state: 'missing' } });
  const proposal = await propose(service, 'similarity');
  assert.equal(proposal.state, 'proposed', JSON.stringify(proposal));
  assert.equal(proposal.cutoff, 0.2);
});

test('both cutoffs from an old calibration file move onto their scales through note saves', async (t) => {
  const { service, start } = await uncalibrated(t);
  const file = { maxDistance: 0.25, minDescriptionSimilarity: 0.75 };
  for (const [scale, cutoff] of [
    ['similarity', file.maxDistance],
    ['description', file.minDescriptionSimilarity],
  ] as const) {
    const saved = await service.execute('save_calibration', {
      scale,
      cutoff,
      evidence: 'note',
      note: 'Moved from the calibration file',
    });
    assert.equal(saved.status, 'ok', JSON.stringify(saved));
  }
  service.close();
  const restarted = start();
  const status = await restarted.execute('check_audiomuse_connection', {});
  assert.deepEqual(status.data!.calibration, {
    similarity: { state: 'calibrated', cutoff: 0.25 },
    description: { state: 'calibrated', cutoff: 0.75 },
  });
  for (const [tool, input] of [
    ['find_similar_tracks', { trackId: 'studio', count: 1 }],
    ['discover_tracks', { description: 'quiet evening', count: 1 }],
  ] as const) {
    const found = await restarted.execute(tool, input);
    assert.equal(found.status, 'ok', JSON.stringify(found));
    assert.equal(found.data!.recommendations.length, 1);
  }
});
