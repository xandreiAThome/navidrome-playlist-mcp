import { baseUrlFault } from '../base-url.ts';
import type { Prompts } from './prompts.ts';

/** A service whose base URL setup asks for. */
export type UrlService = {
  /** The prompt message. */
  label: string;
  /** A full URL shown as the placeholder and in the error for a partial one. */
  example: string;
  /** What setup asks for after the URL, so credentials are not put in it. */
  credentials: string;
  /** Drop a trailing Subsonic `/rest` segment, which Navidrome users often paste. */
  stripRest?: true;
};

export const NAVIDROME_URL: UrlService = {
  label: 'Navidrome URL',
  example: 'https://music.example.com',
  credentials: 'them',
  stripRest: true,
};

export const AUDIOMUSE_URL: UrlService = {
  label: 'AudioMuse URL',
  example: 'http://audiomuse.example.com:8000',
  credentials: 'the API token',
};

export type Normalized = { url: string } | { error: string };

/**
 * Normalizes a user-entered base URL for `service`: trims whitespace and drops
 * trailing slashes (and, for Navidrome, a trailing `/rest`). Rejects what the
 * runtime configuration rejects, through the same rule.
 */
export function normalizeBaseUrl(service: UrlService, input: string): Normalized {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { error: `Enter a full URL such as ${service.example}.` };
  }
  switch (baseUrlFault(url)) {
    case 'scheme':
      return { error: 'Use an http:// or https:// URL.' };
    case 'credentials':
      return {
        error: `Leave credentials out of the URL; setup asks for ${service.credentials} next.`,
      };
    case 'query':
      return { error: 'Remove the query string or fragment.' };
  }
  let path = url.pathname.replace(/\/+$/, '');
  if (service.stripRest) path = path.replace(/\/rest$/i, '');
  return { url: `${url.origin}${path}` };
}

/** Asks for the service's base URL until it normalizes, and returns it normalized. */
export async function askUrl(
  prompts: Prompts,
  service: UrlService,
  initial?: string,
): Promise<string> {
  const answer = await prompts.text({
    message: service.label,
    placeholder: service.example,
    ...(initial ? { initial } : {}),
    validate: (value) => {
      const normalized = normalizeBaseUrl(service, value);
      return 'error' in normalized ? normalized.error : undefined;
    },
  });
  const normalized = normalizeBaseUrl(service, answer);
  // The prompt's validation already rejected anything that does not normalize.
  if ('error' in normalized) throw new Error(normalized.error);
  return normalized.url;
}
