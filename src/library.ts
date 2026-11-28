import { z } from 'zod';

// Requested songs, library tracks, remote playlists, and candidate matches.

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
export const resolutionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('selected'), track: trackSchema, candidates: z.array(trackSchema) }),
  z.object({
    status: z.enum(['ambiguous', 'missing', 'incomplete']),
    track: z.never().optional(),
    candidates: z.array(trackSchema),
  }),
]);
export type Resolution = z.infer<typeof resolutionSchema>;
export type RemotePlaylist = { id: string; name: string; public?: boolean; tracks: Track[] };
