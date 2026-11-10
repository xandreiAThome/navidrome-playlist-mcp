import { resolve } from 'node:path';
import { z } from 'zod';
import { Problem } from './playlists/domain.ts';
import type { Config } from './playlists/domain.ts';

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
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Problem(
      'configuration_error',
      'Invalid local configuration; check the environment variables in README.md.',
    );
  const value = parsed.data;
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
