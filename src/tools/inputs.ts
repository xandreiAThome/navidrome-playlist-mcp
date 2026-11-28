import { z } from 'zod';
import {
  calibrationScaleSchema,
  calibrationVerdictSchema,
} from '../discovery/records/calibration.ts';
import { requestedSongSchema, text } from '../library.ts';
import { entryInputSchema } from '../playlists/records/drafts.ts';

// The public tool input contract: one strict schema per tool.

export const saveDraftSchema = z
  .object({
    draftId: text.optional(),
    expectedRevision: z.number().int().positive().optional(),
    name: text,
    visibility: z.enum(['public', 'private']).default('public'),
    entries: z.array(entryInputSchema).max(500),
  })
  .strict()
  .refine(
    (value) => Boolean(value.draftId) === Boolean(value.expectedRevision),
    'Edits require a draft ID and expected revision.',
  );
export const draftRefSchema = z
  .object({ draftId: text, revision: z.number().int().positive() })
  .strict();
export const getDraftSchema = z
  .object({ draftId: text, revision: z.number().int().positive().optional() })
  .strict();
export const expandDraftSchema = draftRefSchema
  .extend({
    requestKey: text,
    mode: z.enum(['regenerate', 'add_more']),
    count: z.number().int().min(1).max(100).optional(),
    allowAlternateVersions: z.boolean().default(false),
  })
  .strict();
export const publishSchema = draftRefSchema
  .extend({
    operationKey: text,
    approval: z
      .object({ revision: z.number().int().positive(), confirmed: z.literal(true) })
      .strict()
      .optional(),
  })
  .strict();
export const reconcileSchema = z
  .object({
    operationId: text,
    recoveryKey: text,
    expectedRecoveryVersion: z.number().int().nonnegative(),
    action: z.enum(['adopt', 'confirm_not_created', 'resume']),
    playlistId: text.optional(),
    reason: text.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'adopt' && !value.playlistId)
      context.addIssue({
        code: 'custom',
        path: ['playlistId'],
        message: 'Adoption requires a playlist ID.',
      });
    if (value.action !== 'resume' && !value.reason)
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'This recovery action requires an explicit reason.',
      });
    if (value.action !== 'adopt' && value.playlistId)
      context.addIssue({
        code: 'custom',
        path: ['playlistId'],
        message: 'Only adoption accepts a playlist ID.',
      });
    if (value.action === 'resume' && value.reason)
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Resume does not accept an assertion reason.',
      });
  });
export const saveUpdateSchema = z
  .object({
    playlistId: text.optional(),
    draftId: text.optional(),
    expectedRevision: z.number().int().positive().optional(),
    entries: z.array(entryInputSchema).max(500),
    references: z.array(entryInputSchema).max(500).default([]),
    retainedTrackIds: z.array(text).max(500).optional(),
  })
  .strict()
  .refine((v) =>
    v.draftId ? !!v.expectedRevision && !v.playlistId : !!v.playlistId && !v.expectedRevision,
  );
export const reconcileUpdateSchema = z
  .object({
    operationId: text,
    recoveryKey: text,
    expectedRecoveryVersion: z.number().int().nonnegative(),
    action: z.enum(['accept_intended', 'retry', 'accept_current']),
    cannotStillExecute: z.literal(true),
    didNotApply: z.literal(true).optional(),
    reason: text,
  })
  .strict()
  .refine((v) => v.action !== 'retry' || v.didNotApply === true);
export const toolSchemas = {
  save_playlist_update: saveUpdateSchema,
  get_playlist_update: getDraftSchema,
  preview_playlist_update: draftRefSchema,
  refresh_playlist_update: draftRefSchema,
  expand_playlist_update: expandDraftSchema,
  apply_playlist_update: publishSchema,
  get_update_operation: z.object({ operationId: text }).strict(),
  reconcile_playlist_update: reconcileUpdateSchema,
  configure_playlist_discovery: draftRefSchema
    .extend({
      retainedTrackIds: z.array(text).max(500).optional(),
      referenceTrackIds: z.array(text).max(500).optional(),
    })
    .strict(),
  expand_playlist_draft: expandDraftSchema,
  find_similar_tracks: z
    .object({
      trackId: text,
      count: z.number().int().min(1).max(100).default(20),
      allowAlternateVersions: z.boolean().default(false),
    })
    .strict(),
  discover_tracks: z
    .object({ description: text, count: z.number().int().min(1).max(100).default(20) })
    .strict(),
  check_audiomuse_connection: z.object({}).strict(),
  reset_calibration: z.object({ scale: calibrationScaleSchema }).strict(),
  collect_calibration_candidates: z
    .object({
      scale: calibrationScaleSchema,
      probe: text,
      offset: z.number().int().min(0).max(199).default(0),
      count: z.number().int().min(1).max(50).default(10),
    })
    .strict(),
  record_calibration_ratings: z
    .object({
      scale: calibrationScaleSchema,
      probe: text,
      ratings: z
        .array(
          z
            .object({
              trackId: text,
              title: text,
              artist: text,
              score: z.number().finite(),
              rating: calibrationVerdictSchema,
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict(),
  propose_calibration: z.object({ scale: calibrationScaleSchema }).strict(),
  save_calibration: z
    .object({
      scale: calibrationScaleSchema,
      cutoff: z.number().finite(),
      /**
       * `ratings`: the cutoff proposed from the scale's ratings. `note`: an explicit
       * cutoff saved without ratings, e.g. moved from a calibration file, with `note`
       * recording why.
       */
      evidence: z.enum(['ratings', 'note']),
      note: z.string().trim().min(1).max(1000).optional(),
    })
    .strict(),
  check_connection: z.object({}).strict(),
  search_tracks: z.object({ query: text }).strict(),
  resolve_tracks: z.object({ songs: z.array(requestedSongSchema).min(1).max(500) }).strict(),
  list_playlists: z.object({}).strict(),
  get_playlist: z.object({ playlistId: text }).strict(),
  save_playlist_draft: saveDraftSchema,
  get_playlist_draft: getDraftSchema,
  copy_playlist_draft: draftRefSchema.extend({ name: text.optional() }).strict(),
  preview_playlist: draftRefSchema,
  publish_playlist: publishSchema,
  get_operation: z.object({ operationId: text }).strict(),
  reconcile_operation: reconcileSchema,
};
export type ToolName = keyof typeof toolSchemas;
export type ToolInput<K extends ToolName> = z.output<(typeof toolSchemas)[K]>;
