import { z } from 'zod';

// Saved calibrations, their bindings, and calibration ratings.

export const calibrationScaleSchema = z.enum(['similarity', 'description']);
/** A recommendation scale, calibrated, saved, and reset independently. */
export type CalibrationScale = z.infer<typeof calibrationScaleSchema>;
export const calibrationVerdictSchema = z.enum(['good', 'poor']);
export type CalibrationVerdict = z.infer<typeof calibrationVerdictSchema>;
/** What a calibration was measured against; a change to any field makes it stale. */
export type CalibrationBinding = {
  audiomuseUrl: string;
  server: string;
  navidromeUrl: string;
  /** The AudioMuse release, e.g. `v3.7.4`; only its minor release is binding. */
  release: string;
};
/** A saved quality cutoff for one scale. The newest one per scale is current. */
export type Calibration = {
  id: number;
  scale: CalibrationScale;
  /** Similarity: the maximum distance. Description: the minimum similarity. */
  cutoff: number;
  binding: CalibrationBinding & { minor: string };
  /** The rating epoch whose ratings are this calibration's evidence; absent for a note. */
  epoch?: number;
  savedAt: string;
  /** Recorded instead of ratings, e.g. for cutoffs moved from a calibration file. */
  note?: string;
  /** Set when the user reset the scale after an undetectable model or index change. */
  resetAt?: string;
};
/** Why a stored calibration no longer applies: a changed bound field, or a reset. */
export type CalibrationChange = keyof CalibrationBinding | 'reset';
/** A scale's calibration against the live deployment. */
export type CalibrationStatus =
  | { state: 'missing' }
  | { state: 'calibrated'; cutoff: number }
  | { state: 'stale'; cutoff: number; changes: CalibrationChange[] };
/** What a proposal still needs before it can propose a quality cutoff. */
export type CalibrationNeed = 'probes' | 'good' | 'poor' | 'separation';
/** One candidate for a calibration probe, rated good or poor by the user. */
export type CalibrationRating = {
  /** A library track ID (similarity) or listening description (description). */
  probe: string;
  trackId: string;
  title: string;
  artist: string;
  /** The candidate's distance (similarity) or similarity (description). */
  score: number;
  rating: CalibrationVerdict;
};
