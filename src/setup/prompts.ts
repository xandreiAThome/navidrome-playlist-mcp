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

export const required =
  (label: string): Validate =>
  (value) =>
    value.trim() ? undefined : `Enter the ${label}.`;
