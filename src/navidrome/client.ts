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

const playlistMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  public: z.boolean().optional(),
  owner: z.string().optional(),
  readonly: z.boolean().optional(),
});

function playlistVisibility(
  playlist: z.infer<typeof playlistMetadataSchema>,
  envelope: Record<string, unknown>,
): boolean | undefined {
  if (playlist.public !== undefined) return playlist.public;
  // Navidrome 0.64.2 responses.Playlist uses json:"public,omitempty" for a bool.
  // Full responses include owner and readonly; minimal-client responses do not.
  // Keep unknown servers/versions conservative instead of defaulting all omissions.
  if (
    envelope.type === 'navidrome' &&
    typeof envelope.serverVersion === 'string' &&
    /^0\.64\.2(?: |$)/.test(envelope.serverVersion) &&
    playlist.owner !== undefined &&
    playlist.readonly !== undefined
  )
    return false;
  return undefined;
}

const failureSchema = z.object({ error: z.object({ code: z.number() }).optional() });

/** Why a Subsonic request failed, without any upstream text. */
export type Failure = { reason: 'unreachable' } | { reason: 'rejected'; subsonicCode?: number };

/** Subsonic error codes a connection check distinguishes. */
export const SubsonicError = { wrongCredentials: 40, tokenAuthUnsupported: 41 } as const;

/** A failed connection check; `failure` is also the problem's details. */
export class ConnectionFailed extends Problem {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super('navidrome_error', 'Navidrome connection check failed.', failure);
    this.failure = failure;
  }
}
class RequestFailure extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super('Navidrome request failed');
    this.failure = failure;
  }
}

export type NavidromeSettings = Pick<
  Config,
  'url' | 'username' | 'password' | 'timeoutMs' | 'searchPageSize' | 'searchMaxPages'
>;

export class Navidrome {
  private readonly config: NavidromeSettings;
  constructor(config: NavidromeSettings) {
    this.config = config;
  }

  private async request(
    endpoint: string,
    params: [string, string][] = [],
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.send(endpoint, params, signal);
    } catch {
      // Upstream bodies and fetch errors may contain credential-bearing URLs.
      throw new Problem(
        'navidrome_error',
        'Navidrome did not return a usable successful response.',
      );
    }
  }

  /**
   * Checks reachability and authentication. Failures are {@link ConnectionFailed}
   * problems saying whether the server was unreachable or rejected the request
   * (with the Subsonic error code, e.g. 40 for wrong credentials).
   */
  async verifyConnection(): Promise<{ type?: string; serverVersion?: string }> {
    let envelope: Record<string, unknown>;
    try {
      envelope = await this.send('ping');
    } catch (error) {
      const failure: Failure =
        error instanceof RequestFailure ? error.failure : { reason: 'unreachable' };
      throw new ConnectionFailed(failure);
    }
    const parsed = z
      .object({ type: z.string().optional(), serverVersion: z.string().optional() })
      .safeParse(envelope);
    return parsed.success
      ? {
          ...(parsed.data.type ? { type: parsed.data.type } : {}),
          ...(parsed.data.serverVersion ? { serverVersion: parsed.data.serverVersion } : {}),
        }
      : {};
  }

  private async send(
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
    let envelope: z.infer<typeof envelopeSchema>['subsonic-response'];
    try {
      const response = await fetch(url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)])
          : AbortSignal.timeout(this.config.timeoutMs),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('HTTP failure');
      envelope = envelopeSchema.parse(await response.json())['subsonic-response'];
    } catch {
      // Discard the cause: fetch errors may contain credential-bearing URLs.
      throw new RequestFailure({ reason: 'unreachable' });
    }
    if (envelope.status !== 'ok') {
      const code = failureSchema.safeParse(envelope).data?.error?.code;
      throw new RequestFailure({
        reason: 'rejected',
        ...(code === undefined ? {} : { subsonicCode: code }),
      });
    }
    return envelope;
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

  async appendPlaylist(id: string, ids: string[]) {
    if (!ids.length) return;
    await this.request('updatePlaylist', [
      ['playlistId', id],
      ...ids.map((id) => ['songIdToAdd', id] as [string, string]),
    ]);
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
        ...playlistMetadataSchema.shape,
        entry: z.array(trackSchema).default([]),
      })
      .safeParse(body.playlist);
    if (!parsed.success || parsed.data.id !== id)
      throw new Problem('navidrome_error', 'Navidrome returned an invalid playlist.');
    return {
      id,
      name: parsed.data.name,
      public: playlistVisibility(parsed.data, body),
      tracks: parsed.data.entry,
    };
  }

  async listPlaylists() {
    const body = await this.request('getPlaylists');
    const parsed = z
      .object({
        playlist: z
          .array(
            z.object({
              ...playlistMetadataSchema.shape,
              songCount: z.number().optional(),
            }),
          )
          .default([]),
      })
      .safeParse(body.playlists ?? {});
    if (!parsed.success)
      throw new Problem('navidrome_error', 'Navidrome returned an invalid playlist list.');
    return {
      playlists: parsed.data.playlist.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        public: playlistVisibility(playlist, body),
        ...(playlist.songCount !== undefined ? { songCount: playlist.songCount } : {}),
      })),
    };
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
