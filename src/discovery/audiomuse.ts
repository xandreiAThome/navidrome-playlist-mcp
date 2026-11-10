import { z } from 'zod';
import { Problem } from '../playlists/domain.ts';
import type { Config } from '../playlists/domain.ts';

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

  async request(
    path: string,
    signal: AbortSignal,
    body?: object,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const config = this.configured();
    const url = new URL(`${config.url.replace(/\/$/, '')}${path}`);
    url.search = new URLSearchParams({ ...params, server: config.server }).toString();
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Upstream failure');
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
      );
    }
  }

  async checkConnection() {
    const config = this.configured();
    const signal = AbortSignal.timeout(config.budgetMs);
    const parsed = z
      .object({ app_version: z.string().min(1).max(100) })
      .safeParse(await this.request('/api/version', signal));
    if (!parsed.success)
      throw new Problem('audiomuse_error', 'AudioMuse returned an invalid version response.');
    await this.verifyServer(signal);
    return {
      connected: true,
      version: parsed.data.app_version,
      calibrated: Boolean(
        config.calibration && config.calibration.version === parsed.data.app_version,
      ),
    };
  }

  async verifyServer(signal: AbortSignal) {
    const config = this.configured();
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
    const selected = parsed.success
      ? parsed.data.servers.find(
          (server) => server.server_id === config.server || server.name === config.server,
        )
      : undefined;
    if (
      !selected ||
      selected.server_type !== 'navidrome' ||
      selected.creds?.url.replace(/\/$/, '') !== this.navidromeUrl.replace(/\/$/, '')
    )
      throw new Problem(
        'configuration_error',
        'The selected AudioMuse media server must expose the same Navidrome base URL as this service.',
      );
  }
}
