import { AudioMuse } from '../discovery/audiomuse.ts';
import { supportedReleaseMessage } from '../discovery/release.ts';
import { Problem } from '../playlists/domain.ts';
import type { Prompts } from './prompts.ts';
import { required } from './prompts.ts';
import { normalizeNavidromeUrl } from './url.ts';

export type AudioMuseSettings = { url: string; token: string; server: string };

const askUrl = async (prompts: Prompts, initial?: string) => {
  const answer = await prompts.text({
    message: 'AudioMuse URL',
    placeholder: 'http://audiomuse.example.com:8000',
    ...(initial ? { initial } : {}),
    validate: (value) => {
      const normalized = normalizeNavidromeUrl(value);
      return 'error' in normalized ? normalized.error : undefined;
    },
  });
  const normalized = normalizeNavidromeUrl(answer);
  // The prompt's validation already rejected anything that does not normalize.
  if ('error' in normalized) throw new Error(normalized.error);
  return normalized.url;
};
const askToken = (prompts: Prompts) =>
  prompts.password({ message: 'AudioMuse API token', validate: required('API token') });

/**
 * Offers AudioMuse recommendations. On opt-in, returns settings only once the
 * deployment authenticates, runs a supported release, and exposes the given
 * Navidrome as a media server; returns undefined when the user declines or skips.
 */
export async function audioMuseStep(
  prompts: Prompts,
  navidromeUrl: string,
  timeoutMs: number,
): Promise<AudioMuseSettings | undefined> {
  if (!(await prompts.confirm({ message: 'Set up AudioMuse recommendations?', initial: false })))
    return undefined;
  const settings = { url: await askUrl(prompts), token: await askToken(prompts) };
  for (;;) {
    const verdict = await verify(settings, navidromeUrl, timeoutMs, prompts);
    if ('server' in verdict) {
      prompts.log.info('Ask your assistant to calibrate recommendations.');
      return { ...settings, server: verdict.server };
    }
    if (
      verdict.skippable &&
      (await prompts.confirm({
        message: 'Skip AudioMuse setup? Choose No to check again.',
        initial: true,
      }))
    )
      return undefined;
    if (verdict.retry === 'url') settings.url = await askUrl(prompts, settings.url);
    else if (verdict.retry === 'token') settings.token = await askToken(prompts);
  }
}

/**
 * A verified server, or which value to ask again (`check` asks nothing and
 * checks again). A skippable failure is one the user may not be able to fix now.
 */
type Verdict = { server: string } | { retry: 'url' | 'token' | 'check'; skippable?: true };

async function verify(
  settings: { url: string; token: string },
  navidromeUrl: string,
  timeoutMs: number,
  prompts: Prompts,
): Promise<Verdict> {
  // No server yet: the version and server listings do not need one.
  const audiomuse = new AudioMuse({ ...settings, server: '', budgetMs: timeoutMs }, navidromeUrl);
  const signal = AbortSignal.timeout(timeoutMs);
  let version: string;
  let servers: Awaited<ReturnType<AudioMuse['navidromeServers']>>;
  try {
    version = await audiomuse.supportedVersion(signal);
    servers = await audiomuse.navidromeServers(signal);
  } catch (error) {
    if (!(error instanceof Problem)) throw error;
    const details = error.details as { reason?: string; httpStatus?: number; version?: string };
    if (details?.version !== undefined) {
      prompts.log.error(`${supportedReleaseMessage}; the deployment runs ${details.version}.`);
      return { retry: 'url', skippable: true };
    }
    if (details?.reason === 'rejected' && [401, 403].includes(details.httpStatus ?? 0)) {
      prompts.log.error('AudioMuse rejected the API token.');
      return { retry: 'token' };
    }
    prompts.log.error(
      details?.reason === 'rejected'
        ? `AudioMuse at ${settings.url} answered with HTTP ${details.httpStatus}. Check the address.`
        : details?.reason === 'unreachable'
          ? `Could not reach AudioMuse at ${settings.url}. Check the address and that AudioMuse is running.`
          : `${settings.url} did not answer like AudioMuse. Check the address.`,
    );
    return { retry: 'url' };
  }
  if (!servers) {
    prompts.log.error(`${settings.url} did not answer like AudioMuse. Check the address.`);
    return { retry: 'url' };
  }
  if (!servers.length) {
    prompts.log.error(
      `AudioMuse has no Navidrome media server at ${navidromeUrl}. Add this Navidrome server in AudioMuse, then check again.`,
    );
    return { retry: 'check', skippable: true };
  }
  const id =
    servers.length === 1
      ? servers[0]!.server_id
      : await prompts.select({
          message: 'Which AudioMuse media server is this Navidrome?',
          choices: servers.map((server) => ({
            value: server.server_id,
            label: server.name,
            hint: server.server_id,
          })),
        });
  const name = servers.find((server) => server.server_id === id)?.name ?? id;
  prompts.log.success(`Connected to AudioMuse ${version} using media server ${name}.`);
  return { server: id };
}
