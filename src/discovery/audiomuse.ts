import { z } from 'zod';
import { Problem } from '../playlists/domain.ts';
import type { Config } from '../playlists/domain.ts';
import {
  isSupportedRelease,
  releaseMinor,
  supportedAudioMuse,
  supportedReleaseMessage,
} from './release.ts';

export class AudioMuse {
  constructor(
    private readonly config: Config['audiomuse'],
    private readonly navidromeUrl: string,
  ) {}

  private configured() {
    if (!this.config)
      throw new Problem(
        'audiomuse_unavailable',
        'Configure AudioMuse to use discovery. Explicit song lists remain available.',
      );
    return this.config;
  }

  /**
   * Sends one request with the configured server. Setup leaves the server empty
   * to read the version and server listings before one is chosen. Failures are
   * `audiomuse_error` problems whose details say whether AudioMuse was unreachable
   * or rejected the request (with the HTTP status).
   */
  async request(
    path: string,
    signal: AbortSignal,
    body?: object,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const config = this.configured();
    const url = new URL(`${config.url.replace(/\/$/, '')}${path}`);
    url.search = new URLSearchParams({
      ...params,
      ...(config.server ? { server: config.server } : {}),
    }).toString();
    let failure: { reason: 'unreachable' } | { reason: 'rejected'; httpStatus: number } = {
      reason: 'unreachable',
    };
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        failure = { reason: 'rejected', httpStatus: response.status };
        throw new Error('Upstream failure');
      }
      return await response.json();
    } catch {
      if (signal.aborted)
        throw new Problem(
          'discovery_timeout',
          'The overall discovery time budget was exhausted; the draft is unchanged.',
        );
      throw new Problem(
        'audiomuse_error',
        'AudioMuse did not return a usable successful response; check authentication, server selection, and index availability.',
        failure,
      );
    }
  }

  async checkConnection() {
    const config = this.configured();
    const signal = AbortSignal.timeout(config.budgetMs);
    const version = await this.supportedVersion(signal);
    await this.verifyServer(signal);
    return {
      connected: true,
      version,
      // Both the loaded calibration and this deployment are the supported minor release.
      calibrated: Boolean(config.calibration),
    };
  }

  /** The deployment's release, rejected unless it is a supported minor release. */
  async supportedVersion(signal: AbortSignal) {
    const parsed = z
      .object({ app_version: z.string().refine((value) => releaseMinor(value) !== undefined) })
      .safeParse(await this.request('/api/version', signal));
    if (!parsed.success)
      throw new Problem('audiomuse_error', 'AudioMuse returned an invalid version response.');
    const version = parsed.data.app_version;
    if (!isSupportedRelease(version))
      throw new Problem(
        'audiomuse_error',
        `${supportedReleaseMessage}; the deployment runs ${version}. Validate compatibility before using another minor release.`,
        {
          version,
          supportedMinor: supportedAudioMuse.minor,
          validatedBaseline: supportedAudioMuse.validatedBaseline,
        },
      );
    return version;
  }

  /**
   * The AudioMuse media servers that expose this service's Navidrome base URL,
   * or undefined when the listing is malformed.
   */
  async navidromeServers(signal: AbortSignal) {
    const parsed = z
      .object({
        servers: z.array(
          z.object({
            server_id: z.string(),
            name: z.string(),
            server_type: z.string(),
            creds: z.object({ url: z.string() }).optional(),
          }),
        ),
      })
      .safeParse(await this.request('/api/servers', signal));
    if (!parsed.success) return undefined;
    const base = this.navidromeUrl.replace(/\/$/, '');
    return parsed.data.servers.filter(
      (server) =>
        server.server_type === 'navidrome' && server.creds?.url.replace(/\/$/, '') === base,
    );
  }

  async verifyServer(signal: AbortSignal) {
    const config = this.configured();
    const matching = await this.navidromeServers(signal);
    if (
      !matching?.some(
        (server) => server.server_id === config.server || server.name === config.server,
      )
    )
      throw new Problem(
        'configuration_error',
        'The selected AudioMuse media server must expose the same Navidrome base URL as this service.',
      );
  }
}
