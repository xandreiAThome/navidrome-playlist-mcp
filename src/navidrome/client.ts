import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Problem, trackSchema } from '../playlists/domain.ts';
import type { Config, Track, RemotePlaylist } from '../playlists/domain.ts';

const envelopeSchema = z.object({
  'subsonic-response': z
    .object({
      status: z.enum(['ok', 'failed']),
    })
    .passthrough(),
});

export class Navidrome {
  private readonly config: Config;
  constructor(config: Config) {
    this.config = config;
  }

  private async request(
    endpoint: string,
    params: [string, string][] = [],
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const salt = randomBytes(16).toString('hex');
    const token = createHash('md5')
      .update(this.config.password + salt)
      .digest('hex');
    const url = new URL(`${this.config.url.replace(/\/$/, '')}/rest/${endpoint}.view`);
    url.search = new URLSearchParams([
      ['u', this.config.username],
      ['t', token],
      ['s', salt],
      ['v', '1.16.1'],
      ['c', 'navidrome-mcp'],
      ['f', 'json'],
      ...params,
    ]).toString();
    try {
      const response = await fetch(url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)])
          : AbortSignal.timeout(this.config.timeoutMs),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('HTTP failure');
      const envelope = envelopeSchema.parse(await response.json())['subsonic-response'];
      if (envelope.status !== 'ok') throw new Error('API failure');
      return envelope;
    } catch {
      // Upstream bodies and fetch errors may contain credential-bearing URLs.
      throw new Problem(
        'navidrome_error',
        'Navidrome did not return a usable successful response.',
      );
    }
  }

  async ping() {
    await this.request('ping');
    return { connected: true };
  }

  async getSong(id: string, signal?: AbortSignal): Promise<Track> {
    const body = await this.request('getSong', [['id', id]], signal);
    const track = trackSchema.safeParse(body.song);
    if (!track.success || track.data.id !== id)
      throw new Problem('navidrome_error', 'Navidrome returned an invalid track.');
    return track.data;
  }

  async createPlaylist(name: string, ids: string[]): Promise<string> {
    const body = await this.request('createPlaylist', [
      ['name', name],
      ...ids.map((id) => ['songId', id] as [string, string]),
    ]);
    const parsed = z.object({ id: z.string().min(1) }).safeParse(body.playlist);
    if (!parsed.success)
      throw new Problem('navidrome_error', 'Creation did not return a playlist ID.');
    return parsed.data.id;
  }

  async setVisibility(id: string, visibility: 'public' | 'private') {
    await this.request('updatePlaylist', [
      ['playlistId', id],
      ['public', String(visibility === 'public')],
    ]);
  }

  async getPlaylist(id: string): Promise<RemotePlaylist> {
    const body = await this.request('getPlaylist', [['id', id]]);
    const parsed = z
      .object({
        id: z.string(),
        name: z.string(),
        public: z.boolean().optional(),
        entry: z.array(trackSchema).default([]),
      })
      .safeParse(body.playlist);
    if (!parsed.success || parsed.data.id !== id)
      throw new Problem('navidrome_error', 'Navidrome returned an invalid playlist.');
    return { id, name: parsed.data.name, public: parsed.data.public, tracks: parsed.data.entry };
  }

  async listPlaylists() {
    const body = await this.request('getPlaylists');
    const parsed = z
      .object({
        playlist: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              public: z.boolean().optional(),
              songCount: z.number().optional(),
            }),
          )
          .default([]),
      })
      .safeParse(body.playlists ?? {});
    if (!parsed.success)
      throw new Problem('navidrome_error', 'Navidrome returned an invalid playlist list.');
    return { playlists: parsed.data.playlist };
  }

  async search(query: string): Promise<{ tracks: Track[]; complete: boolean }> {
    const tracks = new Map<string, Track>();
    for (let page = 0; page < this.config.searchMaxPages; page++) {
      const body = await this.request('search3', [
        ['query', query],
        ['songCount', String(this.config.searchPageSize)],
        ['songOffset', String(page * this.config.searchPageSize)],
        ['artistCount', '0'],
        ['albumCount', '0'],
      ]);
      const parsed = z
        .object({ song: z.array(trackSchema).default([]) })
        .safeParse(body.searchResult3 ?? {});
      if (!parsed.success)
        throw new Problem('navidrome_error', 'Navidrome returned invalid search results.');
      const before = tracks.size;
      for (const track of parsed.data.song) tracks.set(track.id, track);
      if (parsed.data.song.length < this.config.searchPageSize)
        return { tracks: [...tracks.values()], complete: true };
      if (tracks.size === before) break;
    }
    return { tracks: [...tracks.values()], complete: false };
  }
}
