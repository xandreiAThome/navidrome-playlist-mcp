/** Why a URL cannot be a service base URL. */
export type BaseUrlFault = 'scheme' | 'credentials' | 'query';

/**
 * The rule shared by runtime configuration and setup: a service base URL is
 * HTTP(S) without embedded credentials, query, or fragment. Returns why `url`
 * breaks it, or undefined when it does not.
 */
export function baseUrlFault(url: URL): BaseUrlFault | undefined {
  if (!['http:', 'https:'].includes(url.protocol)) return 'scheme';
  if (url.username || url.password) return 'credentials';
  if (url.search || url.hash) return 'query';
  return undefined;
}
