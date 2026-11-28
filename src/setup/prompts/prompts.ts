/**
 * The interactive surface setup steps depend on. The CLI supplies a terminal
 * implementation; tests supply a scripted one. Every prompt resolves to the
 * answer or rejects with {@link SetupCancelled}.
 */
export type Validate = (value: string) => string | undefined;

export type Choice<T> = { value: T; label: string; hint?: string };

export interface Prompts {
  text(options: {
    message: string;
    initial?: string;
    placeholder?: string;
    validate?: Validate;
  }): Promise<string>;
  /** Hidden input for secrets; the answer is never echoed. */
  password(options: { message: string; validate?: Validate }): Promise<string>;
  confirm(options: { message: string; initial?: boolean }): Promise<boolean>;
  select<T>(options: { message: string; choices: Choice<T>[]; initial?: T }): Promise<T>;
  multiselect<T>(options: {
    message: string;
    choices: Choice<T>[];
    initial?: T[];
    required?: boolean;
  }): Promise<T[]>;
  log: {
    info(message: string): void;
    success(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  /** A block of text the user may need to copy, such as a configuration snippet. */
  note(body: string, title?: string): void;
}

export class SetupCancelled extends Error {
  constructor() {
    super('Setup cancelled.');
  }
}

/** Setup stopped without writing anything; the message is safe to print. */
export class SetupFailed extends Error {}

/**
 * Setup stopped (cancelled or failed, the `cause`) after it had already written
 * some clients. The message, safe to print, names what was written.
 */
export class SetupInterrupted extends Error {
  constructor(cause: unknown, written: string[]) {
    super(
      `Setup ${cause instanceof SetupCancelled ? 'cancelled' : 'stopped'} after installing into ${written.join(', ')}; nothing else was written.`,
      { cause },
    );
  }
}

/**
 * Prompts for unattended runs: messages are shown as usual, but any question
 * fails setup, because the only questions left are ones flags cannot answer,
 * such as asking again for a value that did not verify.
 */
export function unattended(prompts: Prompts): Prompts {
  const refuse = (message: string): never => {
    throw new SetupFailed(
      `--yes cannot answer "${message}". Nothing was written; fix the problem above or run setup without --yes.`,
    );
  };
  return {
    text: async ({ message }) => refuse(message),
    password: async ({ message }) => refuse(message),
    confirm: async ({ message }) => refuse(message),
    select: async ({ message }) => refuse(message),
    multiselect: async ({ message }) => refuse(message),
    log: prompts.log,
    note: (body, title) => prompts.note(body, title),
  };
}

export const required =
  (label: string): Validate =>
  (value) =>
    value.trim() ? undefined : `Enter the ${label}.`;
