import { SetupCancelled } from '../../src/setup/prompts.ts';
import type { Choice, Prompts, Validate } from '../../src/setup/prompts.ts';

type Kind = 'text' | 'password' | 'confirm' | 'select' | 'multiselect';
/** One scripted answer; `message` must match the prompt it answers. */
export type Answer = { kind: Kind; message: RegExp; value: unknown };
export type Event =
  | { kind: Kind; message: string; initial?: unknown; choices?: Choice<unknown>[] }
  | { kind: 'invalid'; message: string; error: string }
  | { kind: 'info' | 'success' | 'warn' | 'error'; message: string }
  | { kind: 'note'; message: string; title?: string };

export const text = (message: RegExp, value: string): Answer => ({ kind: 'text', message, value });
export const password = (message: RegExp, value: string): Answer => ({
  kind: 'password',
  message,
  value,
});
export const confirm = (message: RegExp, value: boolean): Answer => ({
  kind: 'confirm',
  message,
  value,
});
export const multiselect = (message: RegExp, value: unknown[]): Answer => ({
  kind: 'multiselect',
  message,
  value,
});

/**
 * Answers prompts from a script in order and records everything shown. Like the
 * terminal, a text answer that fails validation is reported and the same prompt
 * takes the next scripted answer. Running out of answers cancels setup.
 */
export function scriptedPrompts(script: Answer[]) {
  const answers = [...script];
  const events: Event[] = [];
  const next = (kind: Kind, message: string): unknown => {
    const answer = answers.shift();
    if (!answer) throw new SetupCancelled();
    if (answer.kind !== kind || !answer.message.test(message))
      throw new Error(
        `Script expected ${answer.kind} ${answer.message}, but setup asked ${kind} "${message}"`,
      );
    return answer.value;
  };
  const ask = (kind: 'text' | 'password', message: string, validate?: Validate): string => {
    for (;;) {
      const value = next(kind, message) as string;
      const error = validate?.(value);
      if (error === undefined) return value;
      events.push({ kind: 'invalid', message, error });
    }
  };
  const prompts: Prompts = {
    async text({ message, initial, validate }) {
      events.push({ kind: 'text', message, initial });
      return ask('text', message, validate);
    },
    async password({ message, validate }) {
      events.push({ kind: 'password', message });
      return ask('password', message, validate);
    },
    async confirm({ message, initial }) {
      events.push({ kind: 'confirm', message, initial });
      return next('confirm', message) as boolean;
    },
    async select<T>(options: { message: string; choices: Choice<T>[]; initial?: T }) {
      events.push({ kind: 'select', ...options });
      return next('select', options.message) as T;
    },
    async multiselect<T>(options: { message: string; choices: Choice<T>[]; initial?: T[] }) {
      events.push({ kind: 'multiselect', ...options });
      return next('multiselect', options.message) as T[];
    },
    log: {
      info: (message) => events.push({ kind: 'info', message }),
      success: (message) => events.push({ kind: 'success', message }),
      warn: (message) => events.push({ kind: 'warn', message }),
      error: (message) => events.push({ kind: 'error', message }),
    },
    note: (message, title) => events.push({ kind: 'note', message, title }),
  };
  return {
    prompts,
    events,
    /** Scripted answers setup never asked for. */
    remaining: answers,
    /** Messages of the events of one kind, in order. */
    messages: (kind: Event['kind']) => events.filter((e) => e.kind === kind).map((e) => e.message),
  };
}
