import { parseArgs } from 'node:util';
import { SUPPORTED_CLIENTS } from './steps/clients.ts';
import type { Selection } from './steps/clients.ts';
import { AUDIOMUSE_URL, NAVIDROME_URL, normalizeBaseUrl } from './steps/url.ts';
import type { UrlService } from './steps/url.ts';

/**
 * Answers given on the command line and in the environment. A present value is
 * used instead of asking for it; with `yes`, setup asks nothing at all.
 */
export type SetupFlags = {
  navidrome: { url?: string; username?: string; password?: string };
  /** Present when `--audiomuse-url` opts in to AudioMuse. */
  audiomuse?: { url: string; token?: string };
  clients?: Selection[];
  yes: boolean;
};

const SELECTIONS: readonly string[] = [...SUPPORTED_CLIENTS, 'manual'];
const OPTIONS = {
  url: { type: 'string' },
  username: { type: 'string' },
  client: { type: 'string', multiple: true },
  'audiomuse-url': { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
} as const;
const USAGE =
  'setup accepts --url, --username, --client (repeatable), --audiomuse-url, and --yes. ' +
  'Pass the password and API token in NAVIDROME_PASSWORD and AUDIOMUSE_API_TOKEN, or enter them when asked.';

const KNOWN = new Set(['--url', '--username', '--client', '--audiomuse-url', '--yes', '-y']);

/** The option named by an unknown argument, without any value it carries. */
const optionName = (arg: string) => (arg.startsWith('-') ? arg.split('=')[0] : undefined);

const present = (value: string | undefined) => (value ? value : undefined);

/**
 * Parses `setup` arguments. Error messages never repeat argument values, so a
 * secret typed as a flag is not printed back.
 */
export function parseSetupArgs(
  args: string[],
  env: Record<string, string | undefined>,
): SetupFlags | { error: string } {
  const unknown = args.map(optionName).find((name) => name !== undefined && !KNOWN.has(name));
  if (unknown !== undefined)
    // Only a plain option name is repeated; anything else might be a value.
    return {
      error: `Unknown option${/^--?[a-z][a-z-]*$/i.test(unknown) ? ` ${unknown}` : ''}. ${USAGE}`,
    };
  let values;
  try {
    ({ values } = parseArgs({ args, options: OPTIONS, strict: true, allowPositionals: false }));
  } catch {
    // parseArgs messages can quote the offending argument.
    return { error: `Invalid arguments. ${USAGE}` };
  }
  const url = (flag: string, service: UrlService, value: string | undefined) => {
    if (value === undefined) return {};
    const normalized = normalizeBaseUrl(service, value);
    return 'error' in normalized
      ? { error: `${flag}: ${normalized.error}` }
      : { url: normalized.url };
  };
  const navidromeUrl = url('--url', NAVIDROME_URL, values.url);
  if ('error' in navidromeUrl) return { error: navidromeUrl.error! };
  const audiomuseUrl = url('--audiomuse-url', AUDIOMUSE_URL, values['audiomuse-url']);
  if ('error' in audiomuseUrl) return { error: audiomuseUrl.error! };
  if (values.client?.some((client) => !SELECTIONS.includes(client)))
    return { error: `--client accepts ${SELECTIONS.join(', ')}.` };

  const flags: SetupFlags = {
    navidrome: {
      ...(navidromeUrl.url && { url: navidromeUrl.url }),
      ...(present(values.username) && { username: values.username }),
      ...(present(env.NAVIDROME_PASSWORD) && { password: env.NAVIDROME_PASSWORD }),
    },
    ...(audiomuseUrl.url && {
      audiomuse: {
        url: audiomuseUrl.url,
        ...(present(env.AUDIOMUSE_API_TOKEN) && { token: env.AUDIOMUSE_API_TOKEN }),
      },
    }),
    // Validated against the allowlist above.
    ...(values.client && { clients: [...new Set(values.client)] as Selection[] }),
    yes: values.yes ?? false,
  };
  if (flags.yes) {
    const missing = [
      !flags.navidrome.url && '--url',
      !flags.navidrome.username && '--username',
      !flags.navidrome.password && 'NAVIDROME_PASSWORD',
      flags.audiomuse && !flags.audiomuse.token && 'AUDIOMUSE_API_TOKEN',
      !flags.clients && '--client',
    ].filter(Boolean);
    if (missing.length) return { error: `--yes needs every value: missing ${missing.join(', ')}.` };
  }
  return flags;
}
