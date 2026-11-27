import { Navidrome } from '../navidrome/client.ts';
import { Problem } from '../playlists/domain.ts';
import { required } from './prompts.ts';
import type { Prompts } from './prompts.ts';
import { normalizeNavidromeUrl } from './url.ts';

export type NavidromeAccount = { url: string; username: string; password: string };

const WRONG_CREDENTIALS = 40;
const TOKEN_AUTH_UNSUPPORTED = 41;

type Verdict = { ok: true; server: string } | { ok: false; retry: 'url' | 'credentials' };

async function verify(
  account: NavidromeAccount,
  timeoutMs: number,
  prompts: Prompts,
): Promise<Verdict> {
  const navidrome = new Navidrome({ ...account, timeoutMs, searchPageSize: 1, searchMaxPages: 1 });
  try {
    const { type, serverVersion } = await navidrome.verifyConnection();
    const name = type === 'navidrome' ? 'Navidrome' : type || 'a Subsonic server';
    return { ok: true, server: serverVersion ? `${name} ${serverVersion}` : name };
  } catch (error) {
    if (!(error instanceof Problem)) throw error;
    const details = error.details as { reason?: string; subsonicCode?: number } | undefined;
    if (details?.reason !== 'rejected') {
      prompts.log.error(
        `Could not reach a Navidrome server at ${account.url}. Check the address and that the server is running.`,
      );
      return { ok: false, retry: 'url' };
    }
    prompts.log.error(
      details.subsonicCode === WRONG_CREDENTIALS
        ? 'Navidrome rejected the username or password.'
        : details.subsonicCode === TOKEN_AUTH_UNSUPPORTED
          ? 'Navidrome does not accept token authentication for this account (for example, LDAP users). Use a local Navidrome account.'
          : `Navidrome refused the request${details.subsonicCode === undefined ? '' : ` (Subsonic error ${details.subsonicCode})`}. Check the account.`,
    );
    return { ok: false, retry: 'credentials' };
  }
}

const askUrl = async (prompts: Prompts, initial?: string) => {
  const answer = await prompts.text({
    message: 'Navidrome URL',
    placeholder: 'https://music.example.com',
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
const askUsername = (prompts: Prompts, initial?: string) =>
  prompts.text({
    message: 'Navidrome username',
    ...(initial ? { initial } : {}),
    validate: required('username'),
  });
const askPassword = (prompts: Prompts) =>
  prompts.password({ message: 'Navidrome password', validate: required('password') });

/**
 * Asks for the Navidrome account and returns it only once it verifies. A failure
 * is explained and the value at fault is asked again; setup never continues with
 * a failing account.
 */
export async function navidromeStep(
  prompts: Prompts,
  timeoutMs: number,
): Promise<NavidromeAccount> {
  const account = {
    url: await askUrl(prompts),
    username: await askUsername(prompts),
    password: await askPassword(prompts),
  };
  for (;;) {
    const verdict = await verify(account, timeoutMs, prompts);
    if (verdict.ok) {
      prompts.log.success(`Connected to ${verdict.server} as ${account.username}.`);
      return account;
    }
    if (verdict.retry === 'url') account.url = await askUrl(prompts, account.url);
    else {
      account.username = await askUsername(prompts, account.username);
      account.password = await askPassword(prompts);
    }
  }
}
