import { randomUUID } from 'node:crypto';
import { Problem, targetSchema } from './domain.ts';
import type {
  Config,
  Draft,
  Entry,
  RemotePlaylist,
  ToolInput,
  UpdateOperation,
  UpdateComparison,
} from './domain.ts';
import type { Storage } from '../database/storage.ts';
import type { Navidrome } from '../navidrome/client.ts';
import { match } from './matching.ts';

const ids = (target: RemotePlaylist) => target.tracks.map((t) => t.id);
const same = (a: RemotePlaylist, b: RemotePlaylist) =>
  a.id === b.id &&
  a.name === b.name &&
  a.public === b.public &&
  JSON.stringify(ids(a)) === JSON.stringify(ids(b));

function difference(
  expected: RemotePlaylist,
  actual: RemotePlaylist,
): UpdateComparison['fromOriginal'] {
  const expectedIds = ids(expected);
  const actualIds = ids(actual);
  const counts = new Map<string, { trackId: string; expectedCount: number; actualCount: number }>();
  for (const [side, tracks] of [
    ['expectedCount', expectedIds],
    ['actualCount', actualIds],
  ] as const) {
    for (const id of tracks) {
      const count = counts.get(id) ?? { trackId: id, expectedCount: 0, actualCount: 0 };
      count[side]++;
      counts.set(id, count);
    }
  }
  const positionChanges: UpdateComparison['fromOriginal']['positionChanges'] = [];
  for (let index = 0; index < Math.max(expectedIds.length, actualIds.length); index++) {
    if (expectedIds[index] !== actualIds[index])
      positionChanges.push({
        index,
        expectedTrackId: expectedIds[index] ?? null,
        actualTrackId: actualIds[index] ?? null,
      });
  }
  return {
    nameChanged: expected.name !== actual.name,
    visibilityChanged: actual.public === undefined ? null : expected.public !== actual.public,
    orderedTracksChanged: positionChanges.length > 0,
    occurrenceChanges: [...counts.values()].filter(
      (count) => count.expectedCount !== count.actualCount,
    ),
    positionChanges,
  };
}

function compare(operation: UpdateOperation, current: RemotePlaylist): UpdateComparison {
  const matchesOriginal = same(operation.target, current);
  const matchesIntended = same(operation.intended, current);
  return {
    relationship:
      matchesOriginal && matchesIntended
        ? 'both'
        : matchesOriginal
          ? 'original'
          : matchesIntended
            ? 'intended'
            : 'unexpected',
    matchesOriginal,
    matchesIntended,
    fromOriginal: difference(operation.target, current),
    fromIntended: difference(operation.intended, current),
  };
}

export class Updates {
  constructor(
    private readonly storage: Storage,
    private readonly remote: Navidrome,
    private readonly config: Config,
  ) {}

  get(id: string, revision?: number) {
    const source = this.storage.getDraft(id, revision);
    if (!source.update) throw new Problem('invalid_input', 'Choose an update draft.');
    return source;
  }

  private current(id: string, revision: number) {
    const source = this.get(id);
    if (source.revision !== revision)
      throw new Problem('stale_revision', 'Reload the current update.');
    if (source.locked)
      throw new Problem('draft_locked', 'Use operation recovery or create a fresh update.');
    return source;
  }

  private async target(id: string) {
    const target = await this.remote.getPlaylist(id);
    if (target.public === undefined)
      throw new Problem('navidrome_error', 'Target visibility must be known.');
    return targetSchema.parse(target);
  }

  private async entries(input: ToolInput<'save_playlist_update'>['entries']): Promise<Entry[]> {
    const entries: Entry[] = [];
    for (const entry of input) {
      if (entry.omit) entries.push({ request: entry.request, omit: true });
      else if (entry.trackId)
        entries.push({
          request: entry.request,
          track: await this.remote.getSong(entry.trackId),
          ...(entry.recommendation ? { recommendation: entry.recommendation } : {}),
        });
      else {
        const found = await this.remote.search(entry.request.title);
        const resolution = match(entry.request, found.tracks, found.complete);
        entries.push({
          request: entry.request,
          resolution,
          ...(resolution.track ? { track: resolution.track } : {}),
        });
      }
    }
    return entries;
  }

  async save(input: ToolInput<'save_playlist_update'>) {
    const previous = input.draftId
      ? this.current(input.draftId, input.expectedRevision!)
      : undefined;
    const target = previous?.update?.target ?? (await this.target(input.playlistId!));
    const entries = await this.entries(input.entries);
    // Match provenance by occurrence; null explicitly establishes a supplied song.
    const remaining = [...(previous?.entries ?? [])];
    for (const [index, entry] of entries.entries()) {
      if (!entry.track || input.entries[index]?.recommendation === null) continue;
      const oldIndex = remaining.findIndex(
        (e) => e.track?.id === entry.track?.id && e.recommendation,
      );
      const old = oldIndex >= 0 ? remaining.splice(oldIndex, 1)[0] : undefined;
      if (old?.recommendation) entry.recommendation = old.recommendation;
      else if (entry.recommendation)
        throw new Problem('invalid_input', 'Generate recommendations through update discovery.');
    }
    if (input.retainedTrackIds) {
      if (
        input.retainedTrackIds.some(
          (id) => !entries.some((e) => e.track?.id === id && e.recommendation),
        )
      )
        throw new Problem('invalid_input', 'Only selected recommendations may be retained.');
      for (const entry of entries)
        if (entry.recommendation)
          entry.recommendation = {
            ...entry.recommendation,
            retained: input.retainedTrackIds.includes(entry.track!.id),
          };
    }
    const references = await this.entries(input.references);
    const excluded = new Set([
      ...ids(target),
      ...references.flatMap((e) => (e.track && !e.omit ? [e.track.id] : [])),
      ...entries.flatMap((e) => (!e.recommendation && e.track && !e.omit ? [e.track.id] : [])),
    ]);
    if (entries.some((e) => e.recommendation && e.track && excluded.has(e.track.id)))
      throw new Problem(
        'invalid_input',
        'Remove recommendations that overlap target, references or explicit additions.',
      );
    return this.storage.saveDraft(
      {
        name: target.name,
        visibility: target.public ? 'public' : 'private',
        entries,
        update: {
          target,
          references,
          shortfall: previous?.update?.shortfall ?? 0,
          warnings: previous?.update?.warnings ?? [],
        },
      },
      input.draftId,
      input.expectedRevision,
    );
  }

  preview(input: ToolInput<'preview_playlist_update'>) {
    const source = this.current(input.draftId, input.revision);
    const draft = this.storage.preview(source.id, source.revision);
    const existing = ids(source.update!.target);
    const additions = source.entries.flatMap((e) => (e.track && !e.omit ? [e.track.id] : []));
    const all = [...existing, ...additions];
    return {
      draft,
      existingCount: existing.length,
      resultingCount: all.length,
      resultingTrackIds: all,
      repeatedTrackIds: [
        ...new Set(additions.filter((id, i) => existing.includes(id) || additions.indexOf(id) < i)),
      ],
    };
  }

  async refresh(input: ToolInput<'refresh_playlist_update'>) {
    const source = this.current(input.draftId, input.revision);
    const target = await this.target(source.update!.target.id);
    const excluded = new Set([
      ...ids(target),
      ...source.update!.references.flatMap((e) => (e.track && !e.omit ? [e.track.id] : [])),
    ]);
    const removedTrackIds = source.entries
      .filter((e) => e.recommendation && e.track && excluded.has(e.track.id))
      .map((e) => e.track!.id);
    const draft = this.storage.saveDraft(
      {
        name: target.name,
        visibility: target.public ? 'public' : 'private',
        entries: source.entries.filter(
          (e) => !e.recommendation || !e.track || !excluded.has(e.track.id),
        ),
        update: {
          ...source.update!,
          target,
          warnings: [
            ...new Set([
              ...source.update!.warnings,
              ...removedTrackIds.map((id) => 'Removed excluded recommendation: ' + id),
            ]),
          ],
        },
      },
      source.id,
      source.revision,
    );
    return { draft, removedTrackIds };
  }

  private async validate(source: Draft) {
    if ([...source.entries, ...(source.update?.references ?? [])].some((e) => !e.omit && !e.track))
      throw new Problem(
        'unresolved_songs',
        'Resolve or explicitly omit every addition and reference-only song.',
      );
    for (const entry of source.entries) {
      if (!entry.track || entry.omit) continue;
      const fresh = await this.remote.getSong(entry.track.id);
      if (JSON.stringify(fresh) !== JSON.stringify(entry.track))
        throw new Problem('library_changed', 'An addition changed; revise the update.');
    }
  }

  async apply(input: ToolInput<'apply_playlist_update'>) {
    this.storage.checkOperationKey(input.operationKey, input.draftId, input.revision);
    const previous = this.storage.updateForDraft(input.draftId);
    if (previous) {
      if (previous.revision !== input.revision)
        throw new Problem('stale_revision', 'Use the dispatched revision.');
      this.storage.rememberOperationKey(input.operationKey, input.draftId, input.revision);
      return previous;
    }
    const source = this.current(input.draftId, input.revision);
    if (!source.previewed) throw new Problem('preview_required', 'Preview this revision.');
    if (this.config.requireApproval && input.approval?.revision !== source.revision)
      throw new Problem('approval_required', 'Assert approval of this exact revision.');
    await this.validate(source);
    const target = source.update!.target;
    const additions = source.entries.flatMap((e) => (e.track && !e.omit ? [e.track] : []));
    const operation: UpdateOperation = {
      kind: 'update',
      id: randomUUID(),
      draftId: source.id,
      revision: source.revision,
      operationKey: input.operationKey,
      target,
      intended: { ...target, tracks: [...target.tracks, ...additions] },
      status: 'unknown_outcome',
      recoveryVersion: 0,
      recovery: [],
    };
    const claim = this.storage.claimUpdate(operation, this.config.timeoutMs * 505 + 10000);
    if (!claim.token) return claim.operation;
    // Intent is durable and the target is blocked before any possible dispatch.
    try {
      const current = await this.target(target.id);
      if (!same(target, current)) {
        throw new Problem('target_changed', 'Target changed; refresh and preview this update.');
      }
    } catch (error) {
      this.storage.cancelUndispatchedUpdate(operation.id, claim.token);
      throw error;
    }
    if (!additions.length)
      return this.storage.finishUpdate({ ...operation, status: 'no_changes' }, claim.token, true);
    return this.dispatch(operation, claim.token);
  }

  private async dispatch(operation: UpdateOperation, token: string) {
    try {
      await this.remote.appendPlaylist(
        operation.target.id,
        operation.intended.tracks.slice(operation.target.tracks.length).map((t) => t.id),
      );
      const current = await this.target(operation.target.id);
      return this.storage.finishUpdate(
        {
          ...operation,
          current,
          comparison: compare(operation, current),
          status: same(current, operation.intended) ? 'succeeded' : 'verification_failed',
        },
        token,
        same(current, operation.intended),
      );
    } catch {
      return this.storage.finishUpdate({ ...operation, status: 'unknown_outcome' }, token, false);
    }
  }

  async inspect(id: string) {
    const operation = this.storage.getUpdateOperation(id);
    const current = await this.remote.getPlaylist(operation.target.id);
    return {
      operation,
      current,
      comparison: compare(operation, current),
      observationWarning:
        'Current playlist contents cannot establish causation or that a prior request can no longer execute.',
    };
  }

  async reconcile(input: ToolInput<'reconcile_playlist_update'>) {
    const fingerprint = JSON.stringify(input);
    const previous = this.storage.getUpdateOperation(input.operationId);
    const receipt = previous.recovery.find((r) => r.key === input.recoveryKey);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new Problem('recovery_key_conflict', 'Recovery key was used for another decision.');
      return previous;
    }
    if (['succeeded', 'reconciled', 'no_changes'].includes(previous.status))
      throw new Problem('invalid_recovery', 'This operation is closed.');
    const { operation, token } = this.storage.claimUpdateRecovery(
      previous.id,
      input.expectedRecoveryVersion,
      this.config.timeoutMs * 505 + 10000,
    );
    try {
      if (input.action === 'retry')
        await this.validate(this.get(operation.draftId, operation.revision));
      const current = await this.target(operation.target.id);
      if (input.action === 'accept_intended' && !same(current, operation.intended))
        throw new Problem('adoption_mismatch', 'Current state differs from the intended result.');
      if (input.action === 'retry') {
        if (!same(current, operation.target))
          throw new Problem(
            'target_changed',
            'Baseline changed; accept current state and prepare a fresh update.',
          );
      }
      const decided: UpdateOperation = {
        ...operation,
        current,
        comparison: compare(operation, current),
        recoveryVersion: operation.recoveryVersion + 1,
        recovery: [
          ...operation.recovery,
          { key: input.recoveryKey, fingerprint, action: input.action, reason: input.reason },
        ],
        status:
          input.action === 'accept_intended'
            ? 'succeeded'
            : input.action === 'accept_current'
              ? 'reconciled'
              : 'unknown_outcome',
      };
      if (input.action === 'retry') {
        // Persist the retry assertion before its request can be dispatched.
        this.storage.checkpointUpdate(decided, token);
        return this.dispatch(decided, token);
      }
      return this.storage.finishUpdate(decided, token, true);
    } catch (error) {
      this.storage.finishUpdate(operation, token, false);
      throw error;
    }
  }
}
