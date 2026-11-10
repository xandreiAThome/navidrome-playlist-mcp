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
  audiomuse?: {
    url: string;
    token: string;
    server: string;
    budgetMs: number;
    calibration?: {
      version: string;
      indexModel: string;
      report: string;
      maxDistance: number;
      minDescriptionSimilarity: number;
    };
  };
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
  | 'target_changed'
  | 'audiomuse_unavailable'
  | 'audiomuse_error'
  | 'analysis_unavailable'
  | 'calibration_required'
  | 'discovery_timeout'
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

export const recommendationSchema = z.object({
  kind: z.enum(['description', 'similarity']),
  referenceTrackId: text.optional(),
  score: z.number().finite(),
  retained: z.boolean().default(false),
  uncertainAlternate: z.boolean().default(false),
});
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
export const expandDraftSchema = draftRefSchema
  .extend({
    requestKey: text,
    mode: z.enum(['regenerate', 'add_more']),
    count: z.number().int().min(1).max(100).optional(),
    allowAlternateVersions: z.boolean().default(false),
  })
  .strict();
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
export type UpdatePreview = {
  draft: Draft;
  existingCount: number;
  resultingCount: number;
  resultingTrackIds: string[];
  repeatedTrackIds: string[];
};
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
  save_playlist_update: Draft;
  get_playlist_update: Draft;
  preview_playlist_update: UpdatePreview;
  refresh_playlist_update: { draft: Draft; removedTrackIds: string[] };
  expand_playlist_update: ExpansionResult;
  apply_playlist_update: UpdateOperation;
  get_update_operation: {
    operation: UpdateOperation;
    current: RemotePlaylist;
    comparison: UpdateComparison;
    observationWarning: string;
  };
  reconcile_playlist_update: UpdateOperation;
  configure_playlist_discovery: Draft;
  expand_playlist_draft: ExpansionResult;
  find_similar_tracks: DiscoveryResult;
  discover_tracks: DiscoveryResult;
  check_audiomuse_connection: { connected: boolean; version: string; calibrated: boolean };
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
