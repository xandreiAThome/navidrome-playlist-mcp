import { releaseMinor } from './release.ts';
import { Problem } from '../playlists/domain.ts';
import type {
  Calibration,
  CalibrationBinding,
  CalibrationChange,
  CalibrationNeed,
  CalibrationRating,
  CalibrationScale,
  ToolData,
} from '../playlists/domain.ts';

const baseUrl = (url: string) => url.replace(/\/$/, '');

/**
 * The reasons a calibration is stale against the live deployment, in binding
 * order; empty when it still applies. Patch releases within its minor keep it.
 */
export function calibrationChanges(
  calibration: Calibration,
  live: CalibrationBinding,
): CalibrationChange[] {
  const { binding } = calibration;
  const changes: CalibrationChange[] = [];
  if (baseUrl(binding.audiomuseUrl) !== baseUrl(live.audiomuseUrl)) changes.push('audiomuseUrl');
  if (binding.server !== live.server) changes.push('server');
  if (baseUrl(binding.navidromeUrl) !== baseUrl(live.navidromeUrl)) changes.push('navidromeUrl');
  if (binding.minor !== releaseMinor(live.release)) changes.push('release');
  if (calibration.resetAt) changes.push('reset');
  return changes;
}

/**
 * Per scale, whether score `a` is a closer match than `b`: a similarity score is a
 * distance (lower is closer), a description score a similarity (higher is closer).
 */
const closerOn: Record<CalibrationScale, (a: number, b: number) => boolean> = {
  similarity: (a, b) => a < b,
  description: (a, b) => a > b,
};
const closer = (scale: CalibrationScale, a: number, b: number) => closerOn[scale](a, b);

/**
 * Whether a score meets a scale's quality cutoff. Both cutoffs are inclusive: a
 * similarity cutoff is a maximum distance, a description cutoff a minimum similarity.
 */
export const meetsCutoff = (scale: CalibrationScale, score: number, cutoff: number) =>
  !closer(scale, cutoff, score);

const needMessages: Record<CalibrationNeed, string> = {
  probes: 'ratings from at least three probes',
  good: 'at least one good rating',
  poor: 'at least one poor rating',
  separation: 'a good rating closer than every poor rating',
};

/**
 * Proposes a quality cutoff from one scale's calibration ratings: the closest poor
 * rating bounds it, and it is the furthest good rating still strictly closer than
 * that poor rating, so every poor rating is withheld under the inclusive cutoff.
 * Needs at least one good and one poor rating across at least three probes.
 */
export function proposeCutoff(
  scale: CalibrationScale,
  ratings: CalibrationRating[],
): ToolData['propose_calibration'] {
  const good = ratings.filter((r) => r.rating === 'good').map((r) => r.score);
  const poor = ratings.filter((r) => r.rating === 'poor').map((r) => r.score);
  const evidence = {
    scale,
    probes: new Set(ratings.map((r) => r.probe)).size,
    good: good.length,
    poor: poor.length,
  };
  const needs: CalibrationNeed[] = [];
  if (evidence.probes < 3) needs.push('probes');
  if (!good.length) needs.push('good');
  if (!poor.length) needs.push('poor');
  const closestPoor = poor.reduce((a, b) => (closer(scale, b, a) ? b : a), poor[0] ?? 0);
  const separated = good.filter((score) => closer(scale, score, closestPoor));
  if (good.length && poor.length && !separated.length) needs.push('separation');
  if (needs.length)
    return {
      ...evidence,
      state: 'insufficient',
      needs,
      message: `A proposal needs ${needs.map((need) => needMessages[need]).join(', ')}. Collect candidates further down the list (nextOffset) or for another probe, have the user rate them, then propose again.`,
    };
  const cutoff = separated.reduce((a, b) => (closer(scale, a, b) ? b : a));
  const ordered = [...ratings].sort((a, b) =>
    closer(scale, a.score, b.score) ? -1 : closer(scale, b.score, a.score) ? 1 : 0,
  );
  return {
    ...evidence,
    state: 'proposed',
    cutoff,
    accepted: ordered.filter((r) => meetsCutoff(scale, r.score, cutoff)),
    rejected: ordered.filter((r) => !meetsCutoff(scale, r.score, cutoff)),
  };
}

/** Refuses a cutoff that is not the one currently proposed from the ratings. */
export function checkProposal(
  scale: CalibrationScale,
  cutoff: number,
  ratings: CalibrationRating[],
) {
  const proposal = proposeCutoff(scale, ratings);
  if (proposal.state !== 'proposed' || proposal.cutoff !== cutoff)
    throw new Problem(
      'invalid_input',
      'Save only the cutoff currently proposed from the ratings; propose again and show the user its accepted and rejected candidates.',
      {
        scale,
        proposal:
          proposal.state === 'proposed'
            ? { state: proposal.state, cutoff: proposal.cutoff }
            : { state: proposal.state, needs: proposal.needs },
      },
    );
}
