import { z } from 'zod';
import { requestedSongSchema, resolutionSchema, text, trackSchema } from '../../library.ts';

// Draft revisions, their entries, and playlist-update state.

export const recommendationSchema = z.object({
  kind: z.enum(['description', 'similarity']),
  referenceTrackId: text.optional(),
  score: z.number().finite(),
  retained: z.boolean().default(false),
  uncertainAlternate: z.boolean().default(false),
});
export const entryInputSchema = z
  .object({
    request: requestedSongSchema,
    trackId: text.optional(),
    omit: z.literal(true).optional(),
    recommendation: recommendationSchema.nullable().optional(),
  })
  .strict()
  .refine((entry) => !(entry.trackId && entry.omit), 'Choose a track or omit, not both.')
  .refine(
    (entry) => entry.recommendation === undefined || Boolean(entry.trackId),
    'Recommendation provenance requires an explicit track selection.',
  );
export const entrySchema = z.object({
  request: requestedSongSchema,
  track: trackSchema.optional(),
  omit: z.literal(true).optional(),
  resolution: resolutionSchema.optional(),
  recommendation: recommendationSchema.optional(),
});
export type Entry = z.infer<typeof entrySchema>;
export const targetSchema = z.object({
  id: text,
  name: text,
  public: z.boolean(),
  tracks: z.array(trackSchema),
});
export const updateStateSchema = z.object({
  target: targetSchema,
  references: z.array(entrySchema).max(500),
  shortfall: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
});
export const draftSchema = z.object({
  id: text,
  revision: z.number().int().positive(),
  name: text,
  visibility: z.enum(['public', 'private']),
  entries: z.array(entrySchema),
  previewed: z.boolean(),
  locked: z.boolean(),
  referenceTrackIds: z.array(text).max(500).optional(),
  update: updateStateSchema.optional(),
});
export type Draft = z.infer<typeof draftSchema>;
export type UpdatePreview = {
  draft: Draft;
  existingCount: number;
  resultingCount: number;
  resultingTrackIds: string[];
  repeatedTrackIds: string[];
};
