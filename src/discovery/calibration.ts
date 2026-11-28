import { releaseMinor } from './release.ts';
import type { Calibration, CalibrationBinding } from '../playlists/domain.ts';

/** Why a stored calibration no longer applies: a changed bound field, or a reset. */
export type CalibrationChange = keyof CalibrationBinding | 'reset';

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
