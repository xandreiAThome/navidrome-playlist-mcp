import { z } from 'zod';

export const text = z.string().trim().min(1).max(500);
export const requestedSongSchema = z
  .object({
    title: text,
    artist: text,
    album: text.optional(),
    version: text.optional(),
    duration: z.number().finite().positive().optional(),
  })
  .strict();
export type RequestedSong = z.infer<typeof requestedSongSchema>;
export const trackSchema = z.object({
  id: text,
  title: text,
  artist: text,
  album: z.string().optional(),
  duration: z.number().finite().nonnegative().optional(),
});
export type Track = z.infer<typeof trackSchema>;
export type Config = {
  url: string;
  username: string;
  password: string;
  databasePath: string;
  requireApproval: boolean;
  timeoutMs: number;
  searchPageSize: number;
  searchMaxPages: number;
};
export type ProblemCode =
  | 'configuration_error'
  | 'not_found'
  | 'stale_revision'
  | 'draft_locked'
  | 'operation_key_conflict'
  | 'preview_required'
  | 'operation_busy'
  | 'operation_changed'
  | 'stale_recovery'
  | 'navidrome_error'
  | 'approval_required'
  | 'unresolved_songs'
  | 'empty_playlist'
  | 'library_changed'
  | 'recovery_key_conflict'
  | 'invalid_recovery'
  | 'adoption_mismatch'
  | 'unknown_tool'
  | 'invalid_input'
  | 'internal_error';
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type Result<T = ToolData[ToolName]> =
  | { status: 'ok'; data: T }
  | { status: ProblemCode; message: string; details?: Json; data?: never };
export class Problem extends Error {
  readonly code: ProblemCode;
  readonly details: Json | undefined;
  constructor(code: ProblemCode, message: string, details?: Json) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
export const resolutionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('selected'), track: trackSchema, candidates: z.array(trackSchema) }),
  z.object({
    status: z.enum(['ambiguous', 'missing', 'incomplete']),
    track: z.never().optional(),
    candidates: z.array(trackSchema),
  }),
]);
export type Resolution = z.infer<typeof resolutionSchema>;

export const entryInputSchema = z
  .object({
    request: requestedSongSchema,
    trackId: text.optional(),
    omit: z.literal(true).optional(),
  })
  .strict()
  .refine((entry) => !(entry.trackId && entry.omit), 'Choose a track or omit, not both.');
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
export const entrySchema = z.object({
  request: requestedSongSchema,
  track: trackSchema.optional(),
  omit: z.literal(true).optional(),
  resolution: resolutionSchema.optional(),
});
export type Entry = z.infer<typeof entrySchema>;
export const draftSchema = z.object({
  id: text,
  revision: z.number().int().positive(),
  name: text,
  visibility: z.enum(['public', 'private']),
  entries: z.array(entrySchema),
  previewed: z.boolean(),
  locked: z.boolean(),
});
export type Draft = z.infer<typeof draftSchema>;
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
export const toolSchemas = {
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
export type RemotePlaylist = { id: string; name: string; public?: boolean; tracks: Track[] };

export type ToolData = {
  check_connection: { connected: boolean };
  search_tracks: { tracks: Track[]; complete: boolean };
  resolve_tracks: { resolutions: Resolution[] };
  list_playlists: {
    playlists: { id: string; name: string; public?: boolean; songCount?: number }[];
  };
  get_playlist: RemotePlaylist;
  save_playlist_draft: Draft;
  get_playlist_draft: Draft;
  copy_playlist_draft: Draft;
  preview_playlist: Draft;
  publish_playlist: Operation;
  get_operation: Operation;
  reconcile_operation: Operation;
};
export type ToolInput<K extends ToolName> = z.output<(typeof toolSchemas)[K]>;
export type ToolHandlers = {
  [K in ToolName]: (input: ToolInput<K>) => ToolData[K] | Promise<ToolData[K]>;
};
