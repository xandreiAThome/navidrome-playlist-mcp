import { ConnectionFailed, Navidrome, SubsonicError } from '../navidrome/client.ts';
import type { Failure } from '../navidrome/client.ts';
import { required } from './prompts.ts';
import type { Prompts } from './prompts.ts';
import { NAVIDROME_URL, askUrl } from './url.ts';

export type NavidromeAccount = { url: string; username: string; password: string };

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
    if (!(error instanceof ConnectionFailed)) throw error;
    const { failure } = error;
    if (failure.reason === 'unreachable') {
      prompts.log.error(
        `Could not reach a Navidrome server at ${account.url}. Check the address and that the server is running.`,
      );
      return { ok: false, retry: 'url' };
    }
    prompts.log.error(rejection(failure));
    return { ok: false, retry: 'credentials' };
  }
}

function rejection({ subsonicCode }: Extract<Failure, { reason: 'rejected' }>): string {
  switch (subsonicCode) {
    case SubsonicError.wrongCredentials:
      return 'Navidrome rejected the username or password.';
    case SubsonicError.tokenAuthUnsupported:
      return 'Navidrome does not accept token authentication for this account (for example, LDAP users). Use a local Navidrome account.';
    case undefined:
      return 'Navidrome refused the request. Check the account.';
    default:
      return `Navidrome refused the request (Subsonic error ${subsonicCode}). Check the account.`;
  }
}

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
 * a failing account. Given values are tried before asking; they are asked
 * again only when they fail.
 */
export async function navidromeStep(
  prompts: Prompts,
  timeoutMs: number,
  given: Partial<NavidromeAccount> = {},
): Promise<NavidromeAccount> {
  const account = {
    url: given.url ?? (await askUrl(prompts, NAVIDROME_URL)),
    username: given.username ?? (await askUsername(prompts)),
    password: given.password ?? (await askPassword(prompts)),
  };
  for (;;) {
    const verdict = await verify(account, timeoutMs, prompts);
    if (verdict.ok) {
      prompts.log.success(`Connected to ${verdict.server} as ${account.username}.`);
      return account;
    }
    if (verdict.retry === 'url') account.url = await askUrl(prompts, NAVIDROME_URL, account.url);
    else {
      account.username = await askUsername(prompts, account.username);
      account.password = await askPassword(prompts);
    }
  }
}
