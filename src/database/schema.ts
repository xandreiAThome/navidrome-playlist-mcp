import { integer, text, sqliteTable, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Operation } from '../playlists/domain.ts';

export const identity = sqliteTable(
  'identity',
  {
    singleton: integer().primaryKey(),
    fingerprint: text().notNull(),
  },
  (table) => [check('singleton', sql`${table.singleton}=1`)],
);
export const drafts = sqliteTable('drafts', {
  id: text().primaryKey(),
  currentRevision: integer('current_revision').notNull(),
  locked: integer({ mode: 'boolean' }).notNull().default(false),
});
export const revisions = sqliteTable(
  'revisions',
  {
    draftId: text('draft_id')
      .notNull()
      .references(() => drafts.id),
    revision: integer().notNull(),
    payload: text().notNull(),
    previewed: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.draftId, table.revision] })],
);
export const operations = sqliteTable('operations', {
  id: text().primaryKey(),
  draftId: text('draft_id')
    .notNull()
    .unique()
    .references(() => drafts.id),
  requestKey: text('request_key').notNull().unique(),
  payload: text().notNull(),
  owner: text(),
  leaseUntil: integer('lease_until').notNull().default(0),
  revision: integer().notNull().default(1),
  status: text().$type<Operation['status']>().notNull().default('creating'),
  phase: text().$type<Operation['phase']>().notNull().default('create'),
  playlistId: text('playlist_id'),
  recoveryVersion: integer('recovery_version').notNull().default(0),
});
export const operationKeys = sqliteTable('operation_keys', {
  requestKey: text('request_key').primaryKey(),
  draftId: text('draft_id')
    .notNull()
    .references(() => drafts.id),
  revision: integer().notNull(),
});
