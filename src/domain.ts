import { z } from 'zod';

export const text = z.string().trim().min(1).max(500);
export const requestedSongSchema = z.object({
  title: text, artist: text, album: text.optional(), version: text.optional(),
  duration: z.number().finite().positive().optional(),
}).strict();
export type RequestedSong = z.infer<typeof requestedSongSchema>;
export const trackSchema = z.object({
  id: text, title: text, artist: text, album: z.string().optional(),
  duration: z.number().finite().nonnegative().optional(),
});
export type Track = z.infer<typeof trackSchema>;
export type Config = {
  url: string; username: string; password: string; databasePath: string;
  requireApproval: boolean; timeoutMs: number; searchPageSize: number; searchMaxPages: number;
};
export type Result = { status: string; data?: unknown; message?: string; details?: unknown };
export class Problem extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message); this.code = code; this.details = details;
  }
}
export type Resolution = {
  status: 'selected' | 'ambiguous' | 'missing' | 'incomplete';
  track?: Track; candidates: Track[];
};

export const entryInputSchema = z.object({
  request: requestedSongSchema,
  trackId: text.optional(), omit: z.literal(true).optional(),
}).strict().refine(entry => !(entry.trackId && entry.omit), 'Choose a track or omit, not both.');
export const saveDraftSchema = z.object({
  draftId: text.optional(), expectedRevision: z.number().int().positive().optional(),
  name: text, visibility: z.enum(['public', 'private']).default('public'),
  entries: z.array(entryInputSchema).max(500),
}).strict().refine(value => Boolean(value.draftId) === Boolean(value.expectedRevision),
  'Edits require a draft ID and expected revision.');
export const draftRefSchema = z.object({ draftId: text, revision: z.number().int().positive() }).strict();
export const getDraftSchema = z.object({ draftId: text, revision: z.number().int().positive().optional() }).strict();
export type Entry = { request: RequestedSong; track?: Track; omit?: true; resolution?: Resolution };
export type Draft = {
  id: string; revision: number; name: string; visibility: 'public' | 'private';
  entries: Entry[]; previewed: boolean; locked: boolean;
};
export const publishSchema = draftRefSchema.extend({
  operationKey: text,
  approval: z.object({ revision: z.number().int().positive(), confirmed: z.literal(true) }).strict().optional(),
}).strict();
export const reconcileSchema = z.object({
  operationId: text, recoveryKey: text, expectedRecoveryVersion: z.number().int().nonnegative(),
  action: z.enum(['adopt', 'confirm_not_created', 'resume']), playlistId: text.optional(), reason: text.optional(),
}).strict().superRefine((value, context) => {
  if (value.action === 'adopt' && !value.playlistId)
    context.addIssue({ code: 'custom', path: ['playlistId'], message: 'Adoption requires a playlist ID.' });
  if (value.action !== 'resume' && !value.reason)
    context.addIssue({ code: 'custom', path: ['reason'], message: 'This recovery action requires an explicit reason.' });
  if (value.action !== 'adopt' && value.playlistId)
    context.addIssue({ code: 'custom', path: ['playlistId'], message: 'Only adoption accepts a playlist ID.' });
  if (value.action === 'resume' && value.reason)
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Resume does not accept an assertion reason.' });
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
export type Operation = {
  id: string; draftId: string; revision: number; operationKey: string;
  status: 'creating' | 'unknown_outcome' | 'incomplete' | 'verification_failed' | 'succeeded';
  phase: 'create' | 'visibility' | 'verify' | 'done';
  playlistId?: string; details?: unknown;
  recoveryVersion: number;
  recovery: { key: string; action: string; at: string; reason?: string; playlistId?: string }[];
};
export type RemotePlaylist = { id: string; name: string; public?: boolean; tracks: Track[] };
