import { test } from 'vitest';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { multiselectRow } from '../../src/setup/prompts/terminal.ts';

const plain = (row: string) => stripVTControlCharacters(row);

test('the cursor row stands out from other selected rows without relying on colour', () => {
  const cursor = plain(multiselectRow({ label: 'Claude Code' }, { active: true, selected: true }));
  const other = plain(multiselectRow({ label: 'Cursor' }, { active: false, selected: true }));

  assert.match(cursor, /^› /);
  assert.match(other, /^ {2}/);
  assert.notEqual(cursor.slice(0, 1), other.slice(0, 1));
});

test('the cursor row stands out from unselected rows', () => {
  const cursor = plain(multiselectRow({ label: 'Claude Code' }, { active: true, selected: false }));
  const other = plain(multiselectRow({ label: 'Cursor' }, { active: false, selected: false }));

  assert.match(cursor, /^› /);
  assert.match(other, /^ {2}/);
});

test('a row shows its hint after the label', () => {
  const row = plain(
    multiselectRow(
      { label: 'Cursor', hint: 'detected, ~/.cursor/mcp.json' },
      { active: false, selected: true },
    ),
  );

  assert.match(row, /Cursor \(detected, ~\/\.cursor\/mcp\.json\)$/);
});
