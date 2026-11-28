import { styleText } from 'node:util';
import { MultiSelectPrompt } from '@clack/core';
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

/**
 * One option row of the multiselect. clack's own rows mark the cursor only by
 * undimming the label, which is invisible on a row that is already selected, so
 * the cursor row also gets a pointer that reads without colour.
 */
export function multiselectRow(
  { label, hint }: { label: string; hint?: string },
  { active, selected }: { active: boolean; selected: boolean },
): string {
  const box = selected
    ? styleText('green', clack.S_CHECKBOX_SELECTED)
    : styleText(
        active ? 'cyan' : 'dim',
        active ? clack.S_CHECKBOX_ACTIVE : clack.S_CHECKBOX_INACTIVE,
      );
  const text = active
    ? styleText(['cyan', 'bold'], label)
    : selected
      ? label
      : styleText('dim', label);
  const suffix = hint ? ` ${styleText('dim', `(${hint})`)}` : '';
  return `${active ? styleText('cyan', '›') : ' '} ${box} ${text}${suffix}`;
}

const MULTISELECT_HELP = '↑/↓ to navigate · Space: select · Enter: confirm';

/** clack's multiselect layout with {@link multiselectRow} rows. */
async function multiselect<T>({
  message,
  choices,
  initial,
  required = true,
}: {
  message: string;
  choices: Choice<T>[];
  initial?: T[];
  required?: boolean;
}): Promise<T[] | symbol> {
  const prompt = new MultiSelectPrompt({
    options: choices,
    required,
    ...(initial === undefined ? {} : { initialValues: initial }),
    validate: (value) =>
      required && (value === undefined || value.length === 0)
        ? 'Select at least one option with Space.'
        : undefined,
    render() {
      const bar = styleText('gray', clack.S_BAR);
      const header = `${bar}\n${clack.symbol(this.state)}  ${message}\n`;
      const values = this.value ?? [];
      const chosen = choices.filter((choice) => values.includes(choice.value)).map((c) => c.label);
      if (this.state === 'submit') {
        return `${header}${bar}  ${styleText('dim', chosen.join(', ') || 'none')}`;
      }
      if (this.state === 'cancel') {
        return `${header}${bar}  ${styleText(['strikethrough', 'dim'], chosen.join(', '))}\n${bar}`;
      }
      const colour = this.state === 'error' ? 'yellow' : 'cyan';
      const prefix = `${styleText(colour, clack.S_BAR)}  `;
      const footer =
        this.state === 'error'
          ? `${styleText('yellow', clack.S_BAR_END)}  ${styleText('yellow', this.error)}`
          : `${styleText('cyan', clack.S_BAR_END)}  ${styleText('dim', MULTISELECT_HELP)}`;
      const rows = clack.limitOptions({
        output: process.stdout,
        options: choices,
        cursor: this.cursor,
        columnPadding: 3,
        rowPadding: header.split('\n').length + 1,
        style: (choice, active) =>
          multiselectRow(choice, { active, selected: values.includes(choice.value) }),
      });
      return `${header}${prefix}${rows.join(`\n${prefix}`)}\n${footer}\n`;
    },
  });
  // clack/core leaves the value undefined when nothing was ever toggled.
  return (await prompt.prompt()) ?? [];
}

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
      await multiselect({
        message,
        choices,
        ...(initial === undefined ? {} : { initial }),
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
