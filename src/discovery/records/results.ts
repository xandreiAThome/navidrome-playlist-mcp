import { z } from 'zod';
import { trackSchema } from '../../library.ts';
import type { Track } from '../../library.ts';
import { draftSchema, recommendationSchema } from '../../playlists/records/drafts.ts';

// Recommendation, discovery, and playlist-expansion results.

export const recommendedTrackSchema = z.object({
  track: trackSchema,
  recommendation: recommendationSchema,
});
export type RecommendedTrack = z.infer<typeof recommendedTrackSchema>;
export const discoveryResultSchema = z.object({
  recommendations: z.array(recommendedTrackSchema),
  target: z.number().int(),
  shortfall: z.number().int(),
  candidateLimitReached: z.boolean(),
  warnings: z.array(z.string()),
});
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
export const expansionResultSchema = z.object({
  draft: draftSchema,
  target: z.number().int(),
  added: z.number().int(),
  shortfall: z.number().int(),
  capacityLimited: z.boolean(),
  candidateLimitReached: z.boolean(),
  warnings: z.array(z.string()),
});
export type ExpansionResult = z.infer<typeof expansionResultSchema>;
/** A calibration probe's candidate with its raw distance (similarity) or similarity (description). */
export type CalibrationCandidate = { track: Track; score: number };
