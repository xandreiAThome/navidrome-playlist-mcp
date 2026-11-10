import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Problem } from './playlists/domain.ts';
import type { Config } from './playlists/domain.ts';

const optionalSetting = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = z
    .object({
      NAVIDROME_URL: z.url(),
      NAVIDROME_USERNAME: z.string().min(1),
      NAVIDROME_PASSWORD: z.string().min(1),
      NAVIDROME_DB_PATH: z.string().min(1).default(resolve('.data', 'playlists.sqlite')),
      NAVIDROME_REQUIRE_APPROVAL: z.enum(['true', 'false']).default('false'),
      NAVIDROME_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(15000),
      NAVIDROME_SEARCH_PAGE_SIZE: z.coerce.number().int().min(1).max(500).default(100),
      NAVIDROME_SEARCH_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(20),
      AUDIOMUSE_URL: optionalSetting(z.url()),
      AUDIOMUSE_API_TOKEN: optionalSetting(z.string().trim().min(1)),
      AUDIOMUSE_SERVER: optionalSetting(z.string().trim().min(1).max(500)),
      AUDIOMUSE_BUDGET_MS: z.coerce.number().int().min(100).max(300000).default(60000),
      AUDIOMUSE_CALIBRATION_PATH: optionalSetting(z.string().min(1)),
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Problem(
      'configuration_error',
      'Invalid local configuration; check the environment variables in README.md.',
    );
  const value = parsed.data;
  let audiomuse: Config['audiomuse'];
  if (
    value.AUDIOMUSE_URL ||
    value.AUDIOMUSE_API_TOKEN ||
    value.AUDIOMUSE_SERVER ||
    value.AUDIOMUSE_CALIBRATION_PATH
  ) {
    if (!value.AUDIOMUSE_URL || !value.AUDIOMUSE_API_TOKEN || !value.AUDIOMUSE_SERVER)
      throw new Problem(
        'configuration_error',
        'AudioMuse configuration requires URL, API token, and selected media server.',
      );
    const audioUrl = new URL(value.AUDIOMUSE_URL);
    if (
      !['http:', 'https:'].includes(audioUrl.protocol) ||
      audioUrl.username ||
      audioUrl.password ||
      audioUrl.search ||
      audioUrl.hash
    )
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
    if (value.AUDIOMUSE_CALIBRATION_PATH) {
      try {
        const calibration = z
          .object({
            audiomuseUrl: z.url(),
            navidromeUrl: z.url(),
            server: z.string().min(1),
            version: z.literal('v3.7.1'),
            indexModel: z.string().min(1),
            report: z.string().min(1),
            maxDistance: z.number().finite().nonnegative(),
            minDescriptionSimilarity: z.number().finite().min(-1).max(1),
          })
          .parse(JSON.parse(readFileSync(value.AUDIOMUSE_CALIBRATION_PATH, 'utf8')));
        if (
          calibration.audiomuseUrl.replace(/\/$/, '') !== audiomuse.url ||
          calibration.navidromeUrl.replace(/\/$/, '') !== value.NAVIDROME_URL.replace(/\/$/, '') ||
          calibration.server !== audiomuse.server
        )
          throw new Error('Calibration belongs to another deployment');
        audiomuse.calibration = calibration;
      } catch {
        throw new Problem(
          'configuration_error',
          'The AudioMuse calibration file must be valid and belong to this deployment, Navidrome URL, and selected server.',
        );
      }
    }
  }
  const url = new URL(value.NAVIDROME_URL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
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
