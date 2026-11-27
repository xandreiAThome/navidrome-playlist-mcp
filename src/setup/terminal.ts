import * as clack from '@clack/prompts';
import { SetupCancelled } from './prompts.ts';
import type { Choice, Prompts } from './prompts.ts';

const answered = <T>(value: T): Exclude<T, symbol> => {
  if (clack.isCancel(value)) throw new SetupCancelled();
  // Answers are never symbols other than clack's cancel symbol.
  return value as Exclude<T, symbol>;
};

/**
 * clack's option type is conditional on whether the value is primitive, which a
 * generic value cannot satisfy; a labelled choice is valid for either branch.
 */
const options = <T>(choices: Choice<T>[]) => choices as unknown as clack.Option<T>[];

/** Interactive terminal prompts backed by @clack/prompts. */
export const terminalPrompts: Prompts = {
  async text({ message, initial, placeholder, validate }) {
    return answered(
      await clack.text({
        message,
        ...(initial === undefined ? {} : { initialValue: initial }),
        ...(placeholder === undefined ? {} : { placeholder }),
        ...(validate ? { validate: (value) => validate(value ?? '') } : {}),
      }),
    );
  },
  async password({ message, validate }) {
    return answered(
      await clack.password({
        message,
        ...(validate ? { validate: (value) => validate(value ?? '') } : {}),
      }),
    );
  },
  async confirm({ message, initial }) {
    return answered(
      await clack.confirm({ message, ...(initial === undefined ? {} : { initialValue: initial }) }),
    );
  },
  async select({ message, choices, initial }) {
    return answered(
      await clack.select({
        message,
        options: options(choices),
        ...(initial === undefined ? {} : { initialValue: initial }),
      }),
    );
  },
  async multiselect({ message, choices, initial, required }) {
    return answered(
      await clack.multiselect({
        message,
        options: options(choices),
        ...(initial === undefined ? {} : { initialValues: initial }),
        ...(required === undefined ? {} : { required }),
      }),
    );
  },
  log: {
    info: (message) => clack.log.info(message),
    success: (message) => clack.log.success(message),
    warn: (message) => clack.log.warn(message),
    error: (message) => clack.log.error(message),
  },
  note: (body, title) => clack.note(body, title),
};
