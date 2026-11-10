import { DatabaseSync as Database } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Problem } from './domain.ts';
import type { Config, Draft, Operation } from './domain.ts';

export class Storage {
  private readonly db: Database;
  constructor(config: Config) {
    if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
    this.db = new Database(config.databasePath);
    if (config.databasePath !== ':memory:') chmodSync(config.databasePath, 0o600);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), fingerprint TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, current_revision INTEGER NOT NULL, locked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS revisions (
        draft_id TEXT NOT NULL REFERENCES drafts(id), revision INTEGER NOT NULL, payload TEXT NOT NULL,
        previewed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(draft_id, revision));
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id),
        request_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
        owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS operation_keys (
        request_key TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES drafts(id), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO operation_keys SELECT request_key, draft_id, json_extract(payload, '$.revision') FROM operations;`);
    const fingerprint = createHash('sha256').update(`${config.url.replace(/\/$/, '')}\n${config.username}`).digest('hex');
    this.db.prepare('INSERT OR IGNORE INTO identity VALUES (1, ?)').run(fingerprint);
    const identity = this.db.prepare('SELECT fingerprint FROM identity WHERE singleton=1').get();
    if (identity?.fingerprint !== fingerprint) {
      this.db.close();
      throw new Problem('configuration_error', 'This database belongs to a different Navidrome server or account.');
    }
  }
  close() { this.db.close(); }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = action(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  getDraft(id: string, revision?: number): Draft {
    const row = this.db.prepare(`SELECT r.payload, r.previewed, d.locked FROM drafts d JOIN revisions r ON r.draft_id=d.id
      WHERE d.id=? AND r.revision=COALESCE(?, d.current_revision)`).get(id, revision ?? null);
    if (!row) throw new Problem('not_found', 'Draft or revision was not found.');
    return { ...JSON.parse(String(row.payload)) as Draft, previewed: Boolean(row.previewed), locked: Boolean(row.locked) };
  }

  saveDraft(value: Omit<Draft, 'id' | 'revision' | 'previewed' | 'locked'>, id?: string, expected?: number): Draft {
    return this.transaction(() => {
      const draftId = id ?? randomUUID();
      let revision = 1;
      if (id) {
        const previous = this.getDraft(id);
        if (previous.revision !== expected) throw new Problem('stale_revision', 'Reload the current draft before editing.');
        if (previous.locked) throw new Problem('draft_locked', 'Copy this draft to make changes.');
        revision = previous.revision + 1;
        this.db.prepare('UPDATE drafts SET current_revision=? WHERE id=?').run(revision, id);
      } else this.db.prepare('INSERT INTO drafts (id, current_revision) VALUES (?, 1)').run(draftId);
      const draft: Draft = { ...value, id: draftId, revision, previewed: false, locked: false };
      this.db.prepare('INSERT INTO revisions (draft_id, revision, payload) VALUES (?, ?, ?)')
        .run(draftId, revision, JSON.stringify(draft));
      return draft;
    });
  }

  preview(id: string, revision: number): Draft {
    return this.transaction(() => {
      const draft = this.getDraft(id);
      if (draft.revision !== revision) throw new Problem('stale_revision', 'Preview the current draft revision.');
      this.db.prepare('UPDATE revisions SET previewed=1 WHERE draft_id=? AND revision=?').run(id, revision);
      return { ...draft, previewed: true };
    });
  }

  operationForDraft(id: string): Operation | undefined {
    const row = this.db.prepare('SELECT id FROM operations WHERE draft_id=?').get(id);
    return row ? this.getOperation(String(row.id)) : undefined;
  }

  getOperation(id: string): Operation {
    let row = this.db.prepare('SELECT payload, owner, lease_until FROM operations WHERE id=?').get(id);
    if (!row) throw new Problem('not_found', 'Publish operation was not found.');
    if (row.owner && Number(row.lease_until) <= Date.now()) {
      const operation = JSON.parse(String(row.payload)) as Operation;
      operation.status = operation.playlistId ? 'incomplete' : 'unknown_outcome';
      operation.details = { reason: 'worker_lease_expired' };
      this.db.prepare('UPDATE operations SET payload=?, owner=NULL, lease_until=0 WHERE id=? AND owner=? AND lease_until=?')
        .run(JSON.stringify(operation), id, String(row.owner), Number(row.lease_until));
      row = this.db.prepare('SELECT payload FROM operations WHERE id=?').get(id)!;
    }
    return JSON.parse(String(row.payload)) as Operation;
  }

  checkOperationKey(key: string, draftId: string, revision: number) {
    const row = this.db.prepare('SELECT draft_id, revision FROM operation_keys WHERE request_key=?').get(key);
    if (row) {
      if (row.draft_id !== draftId || Number(row.revision) !== revision)
        throw new Problem('operation_key_conflict', 'This operation key belongs to a different publication.');
    }
  }

  rememberOperationKey(key: string, draftId: string, revision: number) {
    this.db.prepare('INSERT OR IGNORE INTO operation_keys VALUES (?, ?, ?)').run(key, draftId, revision);
    this.checkOperationKey(key, draftId, revision);
  }

  claimPublish(id: string, revision: number, key: string, leaseMs: number): { operation: Operation; token?: string } {
    return this.transaction(() => {
      this.checkOperationKey(key, id, revision);
      const previous = this.operationForDraft(id);
      if (previous) {
        this.rememberOperationKey(key, id, revision);
        return { operation: previous };
      }
      const draft = this.getDraft(id);
      if (draft.revision !== revision) throw new Problem('stale_revision', 'Publish the current draft revision.');
      if (!draft.previewed) throw new Problem('preview_required', 'Preview this draft revision before publishing.');
      const operation: Operation = { id: randomUUID(), draftId: id, revision, operationKey: key,
        status: 'creating', phase: 'create', recoveryVersion: 0, recovery: [] };
      const token = randomUUID();
      this.db.prepare('UPDATE drafts SET locked=1 WHERE id=?').run(id);
      this.db.prepare('INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?)')
        .run(operation.id, id, key, JSON.stringify(operation), token, Date.now() + leaseMs);
      this.rememberOperationKey(key, id, revision);
      return { operation, token };
    });
  }

  updateOperation(operation: Operation, token: string, leaseMs: number, release = false): Operation {
    const result = this.db.prepare('UPDATE operations SET payload=?, owner=?, lease_until=? WHERE id=? AND owner=?')
      .run(JSON.stringify(operation), release ? null : token, release ? 0 : Date.now() + leaseMs, operation.id, token);
    if (!result.changes) throw new Problem('operation_busy', 'Another process owns this operation; reload its status.');
    return operation;
  }

  claimRecovery(id: string, expectedStatus: Operation['status'], expectedVersion: number, leaseMs: number): { operation: Operation; token: string } {
    return this.transaction(() => {
      const operation = this.getOperation(id);
      if (operation.status !== expectedStatus) throw new Problem('operation_changed', 'Reload the operation before recovery.');
      if (operation.recoveryVersion !== expectedVersion)
        throw new Problem('stale_recovery', 'Reload the current recovery version before making a decision.');
      const token = randomUUID();
      const result = this.db.prepare('UPDATE operations SET owner=?, lease_until=? WHERE id=? AND owner IS NULL')
        .run(token, Date.now() + leaseMs, id);
      if (!result.changes) throw new Problem('operation_busy', 'This operation still has an active worker; try again later.');
      return { operation, token };
    });
  }
}
