export type Normalized = { url: string } | { error: string };

/**
 * Normalizes a user-entered server base URL: trims whitespace and drops trailing
 * slashes and a trailing Subsonic `/rest` segment. Rejects what the service
 * configuration rejects: non-HTTP(S) schemes, embedded credentials, query, and
 * fragment.
 */
export function normalizeNavidromeUrl(input: string): Normalized {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { error: 'Enter a full URL such as https://music.example.com.' };
  }
  if (!['http:', 'https:'].includes(url.protocol))
    return { error: 'Use an http:// or https:// URL.' };
  if (url.username || url.password)
    return { error: 'Leave credentials out of the URL; setup asks for them next.' };
  if (url.search || url.hash) return { error: 'Remove the query string or fragment.' };
  const path = url.pathname.replace(/\/+$/, '').replace(/\/rest$/i, '');
  return { url: `${url.origin}${path}` };
}
