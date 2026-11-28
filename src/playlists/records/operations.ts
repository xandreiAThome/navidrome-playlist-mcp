import { z } from 'zod';
import { text } from '../../library.ts';
import { targetSchema } from './drafts.ts';

// Publish and update operation journals and their remote comparisons.

const playlistDifferenceSchema = z.object({
  nameChanged: z.boolean(),
  visibilityChanged: z.boolean().nullable(),
  orderedTracksChanged: z.boolean(),
  occurrenceChanges: z.array(
    z.object({
      trackId: text,
      expectedCount: z.number().int().nonnegative(),
      actualCount: z.number().int().nonnegative(),
    }),
  ),
  positionChanges: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      expectedTrackId: text.nullable(),
      actualTrackId: text.nullable(),
    }),
  ),
});
export const updateComparisonSchema = z.object({
  relationship: z.enum(['original', 'intended', 'both', 'unexpected']),
  matchesOriginal: z.boolean(),
  matchesIntended: z.boolean(),
  fromOriginal: playlistDifferenceSchema,
  fromIntended: playlistDifferenceSchema,
});
export type UpdateComparison = z.infer<typeof updateComparisonSchema>;
export const updateOperationSchema = z.object({
  kind: z.literal('update'),
  id: text,
  draftId: text,
  revision: z.number().int().positive(),
  operationKey: text,
  target: targetSchema,
  intended: targetSchema,
  status: z.enum([
    'unknown_outcome',
    'verification_failed',
    'succeeded',
    'reconciled',
    'no_changes',
  ]),
  recoveryVersion: z.number().int().nonnegative(),
  current: targetSchema.optional(),
  comparison: updateComparisonSchema.optional(),
  recovery: z.array(z.object({ key: text, fingerprint: text, action: text, reason: text })),
});
export type UpdateOperation = z.infer<typeof updateOperationSchema>;
export const operationSchema = z.object({
  id: text,
  draftId: text,
  revision: z.number().int().positive(),
  operationKey: text,
  status: z.enum(['creating', 'unknown_outcome', 'incomplete', 'verification_failed', 'succeeded']),
  phase: z.enum(['create', 'visibility', 'verify', 'done']),
  playlistId: text.optional(),
  details: z.json().optional(),
  recoveryVersion: z.number().int().nonnegative(),
  recovery: z.array(
    z.object({
      key: text,
      action: z.enum(['adopt', 'confirm_not_created', 'resume']),
      at: text,
      reason: text.optional(),
      playlistId: text.optional(),
    }),
  ),
});
export type Operation = z.infer<typeof operationSchema>;
