import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  Problem,
  draftSchema,
  operationSchema,
  expansionResultSchema,
} from '../playlists/domain.ts';
import type { Config, Draft, Operation, ExpansionResult } from '../playlists/domain.ts';
import { migrate } from './migrate.ts';
import {
  identity,
  drafts,
  revisions,
  operations,
  operationKeys,
  expansionReceipts,
} from './schema.ts';

function operationValues(operation: Operation) {
  return {
    payload: JSON.stringify(operation),
    revision: operation.revision,
    status: operation.status,
    phase: operation.phase,
    playlistId: operation.playlistId ?? null,
    recoveryVersion: operation.recoveryVersion,
  };
}

export class Storage {
  private readonly connection: Database.Database;
  private readonly db;
  constructor(config: Config) {
    if (config.databasePath !== ':memory:')
      mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
    this.connection = new Database(config.databasePath);
    this.db = drizzle(this.connection);
    try {
      if (config.databasePath !== ':memory:') chmodSync(config.databasePath, 0o600);
      this.connection.pragma('journal_mode = WAL');
      this.connection.pragma('foreign_keys = ON');
      this.connection.pragma('busy_timeout = 5000');
      // Check existing account identity before altering a legacy database.
      const exists = this.connection
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='identity'")
        .get();
      const fingerprint = createHash('sha256')
        .update(`${config.url.replace(/\/$/, '')}\n${config.username}`)
        .digest('hex');
      if (exists) this.checkIdentity(fingerprint);
      migrate(this.connection);
      this.db.insert(identity).values({ singleton: 1, fingerprint }).onConflictDoNothing().run();
      this.checkIdentity(fingerprint);
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  private checkIdentity(fingerprint: string) {
    const row = this.db.select().from(identity).where(eq(identity.singleton, 1)).get();
    if (row && row.fingerprint !== fingerprint)
      throw new Problem(
        'configuration_error',
        'This database belongs to a different Navidrome server or account.',
      );
  }

  close() {
    this.connection.close();
  }
  private transaction<T>(action: () => T): T {
    return this.connection.transaction(action).immediate();
  }

  getDraft(id: string, revision?: number): Draft {
    const draft = this.db.select().from(drafts).where(eq(drafts.id, id)).get();
    const row =
      draft &&
      this.db
        .select()
        .from(revisions)
        .where(
          and(eq(revisions.draftId, id), eq(revisions.revision, revision ?? draft.currentRevision)),
        )
        .get();
    if (!row || !draft) throw new Problem('not_found', 'Draft or revision was not found.');
    const snapshot = draftSchema.safeParse(JSON.parse(row.payload));
    if (!snapshot.success) throw new Error('Invalid stored draft snapshot.');
    return { ...snapshot.data, previewed: row.previewed, locked: draft.locked };
  }

  saveDraft(
    value: Omit<Draft, 'id' | 'revision' | 'previewed' | 'locked'>,
    id?: string,
    expected?: number,
  ): Draft {
    return this.transaction(() => {
      const draftId = id ?? randomUUID();
      let revision = 1;
      if (id) {
        const previous = this.getDraft(id);
        if (previous.revision !== expected)
          throw new Problem('stale_revision', 'Reload the current draft before editing.');
        if (previous.locked) throw new Problem('draft_locked', 'Copy this draft to make changes.');
        revision = previous.revision + 1;
        this.db.update(drafts).set({ currentRevision: revision }).where(eq(drafts.id, id)).run();
      } else this.db.insert(drafts).values({ id: draftId, currentRevision: 1 }).run();
      const draft: Draft = { ...value, id: draftId, revision, previewed: false, locked: false };
      this.db
        .insert(revisions)
        .values({ draftId, revision, payload: JSON.stringify(draft) })
        .run();
      return draft;
    });
  }

  preview(id: string, revision: number): Draft {
    return this.transaction(() => {
      const draft = this.getDraft(id);
      if (draft.revision !== revision)
        throw new Problem('stale_revision', 'Preview the current draft revision.');
      this.db
        .update(revisions)
        .set({ previewed: true })
        .where(and(eq(revisions.draftId, id), eq(revisions.revision, revision)))
        .run();
      return { ...draft, previewed: true };
    });
  }

  expansionReceipt(key: string, fingerprint: string): ExpansionResult | undefined {
    const row = this.db
      .select()
      .from(expansionReceipts)
      .where(eq(expansionReceipts.requestKey, key))
      .get();
    if (!row) return undefined;
    if (row.fingerprint !== fingerprint)
      throw new Problem(
        'operation_key_conflict',
        'This request key belongs to a different expansion.',
      );
    return expansionResultSchema.parse(JSON.parse(row.payload));
  }

  saveExpansion(
    value: Omit<Draft, 'id' | 'revision' | 'previewed' | 'locked'>,
    id: string,
    expected: number,
    key: string,
    fingerprint: string,
    outcome: Omit<ExpansionResult, 'draft'>,
  ): ExpansionResult {
    return this.transaction(() => {
      const previous = this.expansionReceipt(key, fingerprint);
      if (previous) return previous;
      const draft = this.saveDraft(value, id, expected);
      const result = { ...outcome, draft };
      this.db
        .insert(expansionReceipts)
        .values({ requestKey: key, fingerprint, payload: JSON.stringify(result) })
        .run();
      return result;
    });
  }

  operationForDraft(id: string): Operation | undefined {
    const row = this.db
      .select({ id: operations.id })
      .from(operations)
      .where(eq(operations.draftId, id))
      .get();
    return row ? this.getOperation(row.id) : undefined;
  }

  getOperation(id: string): Operation {
    let row = this.db.select().from(operations).where(eq(operations.id, id)).get();
    if (!row) throw new Problem('not_found', 'Publish operation was not found.');
    if (row.owner && row.leaseUntil <= Date.now()) {
      const snapshot = operationSchema.safeParse(JSON.parse(row.payload));
      if (!snapshot.success) throw new Error('Invalid stored operation snapshot.');
      const operation: Operation = {
        ...snapshot.data,
        status: row.playlistId ? 'incomplete' : 'unknown_outcome',
        details: { reason: 'worker_lease_expired' },
      };
      // Compare both lease and owner so a stale reader cannot release a renewed worker.
      this.db
        .update(operations)
        .set({ ...operationValues(operation), owner: null, leaseUntil: 0 })
        .where(
          and(
            eq(operations.id, id),
            eq(operations.owner, row.owner),
            eq(operations.leaseUntil, row.leaseUntil),
          ),
        )
        .run();
      row = this.db.select().from(operations).where(eq(operations.id, id)).get()!;
    }
    const snapshot = operationSchema.safeParse(JSON.parse(row.payload));
    if (!snapshot.success) throw new Error('Invalid stored operation snapshot.');
    return snapshot.data;
  }

  checkOperationKey(key: string, draftId: string, revision: number) {
    const row = this.db.select().from(operationKeys).where(eq(operationKeys.requestKey, key)).get();
    if (row && (row.draftId !== draftId || row.revision !== revision))
      throw new Problem(
        'operation_key_conflict',
        'This operation key belongs to a different publication.',
      );
  }

  rememberOperationKey(key: string, draftId: string, revision: number) {
    this.db
      .insert(operationKeys)
      .values({ requestKey: key, draftId, revision })
      .onConflictDoNothing()
      .run();
    this.checkOperationKey(key, draftId, revision);
  }

  claimPublish(
    id: string,
    revision: number,
    key: string,
    leaseMs: number,
  ): { operation: Operation; token?: string } {
    return this.transaction(() => {
      this.checkOperationKey(key, id, revision);
      const previous = this.operationForDraft(id);
      if (previous) {
        this.rememberOperationKey(key, id, revision);
        return { operation: previous };
      }
      const draft = this.getDraft(id);
      if (draft.revision !== revision)
        throw new Problem('stale_revision', 'Publish the current draft revision.');
      if (!draft.previewed)
        throw new Problem('preview_required', 'Preview this draft revision before publishing.');
      const operation: Operation = {
        id: randomUUID(),
        draftId: id,
        revision,
        operationKey: key,
        status: 'creating',
        phase: 'create',
        recoveryVersion: 0,
        recovery: [],
      };
      const token = randomUUID();
      this.db.update(drafts).set({ locked: true }).where(eq(drafts.id, id)).run();
      this.db
        .insert(operations)
        .values({
          id: operation.id,
          draftId: id,
          requestKey: key,
          ...operationValues(operation),
          owner: token,
          leaseUntil: Date.now() + leaseMs,
        })
        .run();
      this.rememberOperationKey(key, id, revision);
      return { operation, token };
    });
  }

  updateOperation(
    operation: Operation,
    token: string,
    leaseMs: number,
    release = false,
  ): Operation {
    const result = this.db
      .update(operations)
      .set({
        ...operationValues(operation),
        owner: release ? null : token,
        leaseUntil: release ? 0 : Date.now() + leaseMs,
      })
      .where(and(eq(operations.id, operation.id), eq(operations.owner, token)))
      .run();
    if (!result.changes)
      throw new Problem(
        'operation_busy',
        'Another process owns this operation; reload its status.',
      );
    return operation;
  }

  claimRecovery(
    id: string,
    expectedStatus: Operation['status'],
    expectedVersion: number,
    leaseMs: number,
  ): { operation: Operation; token: string } {
    return this.transaction(() => {
      const operation = this.getOperation(id);
      if (operation.status !== expectedStatus)
        throw new Problem('operation_changed', 'Reload the operation before recovery.');
      if (operation.recoveryVersion !== expectedVersion)
        throw new Problem(
          'stale_recovery',
          'Reload the current recovery version before making a decision.',
        );
      const token = randomUUID();
      const result = this.db
        .update(operations)
        .set({ owner: token, leaseUntil: Date.now() + leaseMs })
        .where(and(eq(operations.id, id), isNull(operations.owner)))
        .run();
      if (!result.changes)
        throw new Problem(
          'operation_busy',
          'This operation still has an active worker; try again later.',
        );
      return { operation, token };
    });
  }
}
