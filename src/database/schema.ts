import {
  integer,
  text,
  sqliteTable,
  primaryKey,
  check,
  uniqueIndex,
  index,
  real,
} from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Operation, CalibrationScale, CalibrationVerdict } from '../playlists/domain.ts';

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

export const expansionReceipts = sqliteTable('expansion_receipts', {
  requestKey: text('request_key').primaryKey(),
  fingerprint: text().notNull(),
  payload: text().notNull(),
});

export const updateOperations = sqliteTable(
  'update_operations',
  {
    id: text().primaryKey(),
    draftId: text('draft_id')
      .notNull()
      .unique()
      .references(() => drafts.id),
    targetId: text('target_id').notNull(),
    payload: text().notNull(),
    owner: text(),
    leaseUntil: integer('lease_until').notNull().default(0),
    blocked: integer({ mode: 'boolean' }).notNull().default(true),
  },
  (table) => [
    uniqueIndex('update_target_block')
      .on(table.targetId)
      .where(sql`${table.blocked} = 1`),
  ],
);

const scaleCheck = (column: AnySQLiteColumn) => sql`${column} IN ('similarity', 'description')`;

export const calibrations = sqliteTable(
  'calibrations',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    scale: text().$type<CalibrationScale>().notNull(),
    cutoff: real().notNull(),
    audiomuseUrl: text('audiomuse_url').notNull(),
    server: text().notNull(),
    navidromeUrl: text('navidrome_url').notNull(),
    release: text().notNull(),
    releaseMinor: text('release_minor').notNull(),
    epoch: integer().notNull(),
    note: text(),
    savedAt: text('saved_at').notNull(),
    resetAt: text('reset_at'),
  },
  (table) => [
    check('calibrations_scale', scaleCheck(table.scale)),
    index('calibration_scale').on(table.scale, table.id),
  ],
);

export const calibrationScales = sqliteTable(
  'calibration_scales',
  {
    scale: text().$type<CalibrationScale>().primaryKey(),
    epoch: integer().notNull(),
  },
  (table) => [check('calibration_scales_scale', scaleCheck(table.scale))],
);

export const calibrationRatings = sqliteTable(
  'calibration_ratings',
  {
    scale: text().$type<CalibrationScale>().notNull(),
    epoch: integer().notNull(),
    probe: text().notNull(),
    itemId: text('item_id').notNull(),
    title: text().notNull(),
    author: text().notNull(),
    score: real().notNull(),
    rating: text().$type<CalibrationVerdict>().notNull(),
    ratedAt: text('rated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scale, table.epoch, table.probe, table.itemId] }),
    check('calibration_ratings_scale', scaleCheck(table.scale)),
    check('calibration_ratings_rating', sql`${table.rating} IN ('good', 'poor')`),
  ],
);
