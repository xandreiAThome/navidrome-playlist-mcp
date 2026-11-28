import { posix, win32 } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { baseUrlFault } from './base-url.ts';
import { Problem } from './playlists/domain.ts';
import type { Config } from './playlists/domain.ts';

const optionalSetting = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export interface Host {
  platform: NodeJS.Platform;
  homedir: string;
}

function defaultDatabasePath(env: NodeJS.ProcessEnv, host: Host): string {
  if (host.platform === 'win32')
    return win32.join(
      env.LOCALAPPDATA || win32.join(host.homedir, 'AppData', 'Local'),
      'navidrome-playlist-mcp',
      'playlists.sqlite',
    );
  const base =
    host.platform === 'darwin'
      ? posix.join(host.homedir, 'Library', 'Application Support')
      : env.XDG_DATA_HOME || posix.join(host.homedir, '.local', 'share');
  return posix.join(base, 'navidrome-playlist-mcp', 'playlists.sqlite');
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  host: Host = { platform: process.platform, homedir: homedir() },
): Config {
  const parsed = z
    .object({
      NAVIDROME_URL: z.url(),
      NAVIDROME_USERNAME: z.string().min(1),
      NAVIDROME_PASSWORD: z.string().min(1),
      NAVIDROME_DB_PATH: z.string().min(1).default(defaultDatabasePath(env, host)),
      NAVIDROME_REQUIRE_APPROVAL: z.enum(['true', 'false']).default('false'),
      NAVIDROME_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(15000),
      NAVIDROME_SEARCH_PAGE_SIZE: z.coerce.number().int().min(1).max(500).default(100),
      NAVIDROME_SEARCH_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(20),
      AUDIOMUSE_URL: optionalSetting(z.url()),
      AUDIOMUSE_API_TOKEN: optionalSetting(z.string().trim().min(1)),
      AUDIOMUSE_SERVER: optionalSetting(z.string().trim().min(1).max(500)),
      AUDIOMUSE_BUDGET_MS: z.coerce.number().int().min(100).max(300000).default(60000),
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Problem(
      'configuration_error',
      'Invalid local configuration; check the environment variables in README.md.',
    );
  const value = parsed.data;
  let audiomuse: Config['audiomuse'];
  // The former AUDIOMUSE_CALIBRATION_PATH is ignored: calibration lives in local
  // storage, and file cutoffs move there once through save_calibration.
  if (value.AUDIOMUSE_URL || value.AUDIOMUSE_API_TOKEN || value.AUDIOMUSE_SERVER) {
    if (!value.AUDIOMUSE_URL || !value.AUDIOMUSE_API_TOKEN || !value.AUDIOMUSE_SERVER)
      throw new Problem(
        'configuration_error',
        'AudioMuse configuration requires URL, API token, and selected media server.',
      );
    const audioUrl = new URL(value.AUDIOMUSE_URL);
    if (baseUrlFault(audioUrl))
      throw new Problem(
        'configuration_error',
        'Use an HTTP(S) AudioMuse base URL without embedded credentials, query, or fragment.',
      );
    audiomuse = {
      url: audioUrl.toString().replace(/\/$/, ''),
      token: value.AUDIOMUSE_API_TOKEN,
      server: value.AUDIOMUSE_SERVER,
      budgetMs: value.AUDIOMUSE_BUDGET_MS,
    };
  }
  const url = new URL(value.NAVIDROME_URL);
  if (baseUrlFault(url))
    throw new Problem(
      'configuration_error',
      'Use an HTTP(S) server base URL without credentials, query, or fragment.',
    );
  return {
    ...(audiomuse ? { audiomuse } : {}),
    url: url.toString().replace(/\/$/, ''),
    username: value.NAVIDROME_USERNAME,
    password: value.NAVIDROME_PASSWORD,
    databasePath: value.NAVIDROME_DB_PATH,
    requireApproval: value.NAVIDROME_REQUIRE_APPROVAL === 'true',
    timeoutMs: value.NAVIDROME_TIMEOUT_MS,
    searchPageSize: value.NAVIDROME_SEARCH_PAGE_SIZE,
    searchMaxPages: value.NAVIDROME_SEARCH_MAX_PAGES,
  };
}
