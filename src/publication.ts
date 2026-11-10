import { Problem, publishSchema, reconcileSchema } from './domain.ts';
import type { Config, Draft, Operation } from './domain.ts';
import type { Storage } from './storage.ts';
import type { Navidrome } from './navidrome.ts';

function selectedTracks(draft: Draft) {
  return draft.entries.flatMap(entry => entry.track && !entry.omit ? [entry.track] : []);
}

export class Publication {
  private readonly storage: Storage;
  private readonly navidrome: Navidrome;
  private readonly config: Config;
  private readonly leaseMs: number;
  constructor(storage: Storage, navidrome: Navidrome, config: Config) {
    this.storage = storage; this.navidrome = navidrome; this.config = config;
    this.leaseMs = config.timeoutMs * 3 + 10_000;
  }

  async publish(input: unknown): Promise<Operation> {
    const value = publishSchema.parse(input);
    this.storage.checkOperationKey(value.operationKey, value.draftId, value.revision);
    const draft = this.storage.getDraft(value.draftId);
    if (draft.revision !== value.revision) throw new Problem('stale_revision', 'Publish the current draft revision.');
    const previous = this.storage.operationForDraft(draft.id);
    if (previous) {
      this.storage.rememberOperationKey(value.operationKey, draft.id, draft.revision);
      return previous;
    }
    if (!draft.previewed) throw new Problem('preview_required', 'Preview this draft revision before publishing.');
    if (this.config.requireApproval && value.approval?.revision !== draft.revision)
      throw new Problem('approval_required', 'Assert human approval of this exact revision.');
    if (draft.entries.some(entry => !entry.omit && !entry.track))
      throw new Problem('unresolved_songs', 'Select or explicitly omit every requested song.');
    const selected = selectedTracks(draft);
    if (!selected.length) throw new Problem('empty_playlist', 'Select at least one library track.');
    await this.revalidate(draft);
    const claim = this.storage.claimPublish(draft.id, draft.revision, value.operationKey, this.leaseMs);
    if (!claim.token) return claim.operation;
    return this.create(draft, claim.operation, claim.token);
  }

  private async revalidate(draft: Draft) {
    for (const track of selectedTracks(draft)) {
      let current;
      try { current = await this.navidrome.getSong(track.id); }
      catch { throw new Problem('library_changed', 'A selected track is unavailable; revalidate the draft.', { trackId: track.id }); }
      if (JSON.stringify(current) !== JSON.stringify(track))
        throw new Problem('library_changed', 'Selected track metadata changed; save and preview a new revision.', { trackId: track.id });
    }
  }

  private async create(draft: Draft, pending: Operation, token: string): Promise<Operation> {
    let id: string;
    try {
      id = await this.navidrome.createPlaylist(draft.name, selectedTracks(draft).map(track => track.id));
    } catch {
      return this.storage.updateOperation({ ...pending, status: 'unknown_outcome',
        details: { reason: 'creation_not_confirmed', nextAction: 'reconcile_operation' } }, token, this.leaseMs, true);
    }
    const operation = this.storage.updateOperation({ ...pending, playlistId: id,
      status: 'incomplete', phase: 'visibility', details: undefined }, token, this.leaseMs);
    return this.finish(draft, operation, token);
  }

  private async finish(draft: Draft, operation: Operation, token: string): Promise<Operation> {
    try {
      await this.navidrome.setVisibility(operation.playlistId!, draft.visibility);
      operation = this.storage.updateOperation({ ...operation, phase: 'verify' }, token, this.leaseMs);
      const playlist = await this.navidrome.getPlaylist(operation.playlistId!);
      const expectedIds = selectedTracks(draft).map(track => track.id);
      const actualIds = playlist.tracks.map(track => track.id);
      if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds) || playlist.name !== draft.name) {
        return this.storage.updateOperation({ ...operation, status: 'verification_failed', details: {
          expectedIds, actualIds, expectedName: draft.name, actualName: playlist.name,
          expectedPublic: draft.visibility === 'public', actualPublic: playlist.public ?? null,
        } }, token, this.leaseMs, true);
      }
      if (playlist.public !== (draft.visibility === 'public')) {
        return this.storage.updateOperation({ ...operation, status: 'incomplete', phase: 'visibility', details: {
          reason: 'visibility_not_verified', expectedPublic: draft.visibility === 'public', actualPublic: playlist.public ?? null,
        } }, token, this.leaseMs, true);
      }
      return this.storage.updateOperation({ ...operation, phase: 'done', status: 'succeeded', details: undefined }, token, this.leaseMs, true);
    } catch (error) {
      if (error instanceof Problem && error.code === 'operation_busy') throw error;
      return this.storage.updateOperation({ ...operation, status: 'incomplete',
        details: { reason: 'navidrome_step_failed', nextAction: 'resume', phase: operation.phase } }, token, this.leaseMs, true);
    }
  }

  async reconcile(input: unknown): Promise<Operation> {
    const value = reconcileSchema.parse(input);
    const previous = this.storage.getOperation(value.operationId);
    const priorDecision = previous.recovery.find(decision => decision.key === value.recoveryKey);
    const reason = 'reason' in value ? value.reason : undefined;
    const playlistId = 'playlistId' in value ? value.playlistId : undefined;
    if (priorDecision) {
      if (priorDecision.action !== value.action || priorDecision.reason !== reason || priorDecision.playlistId !== playlistId)
        throw new Problem('recovery_key_conflict', 'This recovery key belongs to a different decision.');
      return previous;
    }
    if (previous.status === 'succeeded') return previous;
    if (value.action === 'resume' ? !previous.playlistId : previous.status !== 'unknown_outcome')
      throw new Problem('invalid_recovery', 'Resume a known playlist, or explicitly reconcile an unknown creation.');
    const claim = this.storage.claimRecovery(previous.id, previous.status, value.expectedRecoveryVersion, this.leaseMs);
    let operation = claim.operation;
    const token = claim.token;
    const draft = this.storage.getDraft(operation.draftId, operation.revision);
    const recovery = [...operation.recovery, { key: value.recoveryKey, action: value.action,
      at: new Date().toISOString(), reason, playlistId }];
    operation = this.storage.updateOperation({ ...operation, recovery,
      recoveryVersion: operation.recoveryVersion + 1 }, token, this.leaseMs);
    if (value.action === 'resume') return this.finish(draft, operation, token);
    if (value.action === 'adopt') {
      try {
        const playlist = await this.navidrome.getPlaylist(value.playlistId!);
        const ids = selectedTracks(draft).map(track => track.id);
        if (playlist.name !== draft.name || JSON.stringify(playlist.tracks.map(track => track.id)) !== JSON.stringify(ids))
          throw new Problem('adoption_mismatch', 'The specified playlist does not match this draft.');
      } catch (error) {
        this.storage.updateOperation(operation, token, this.leaseMs, true);
        throw error;
      }
      const adopted = this.storage.updateOperation({ ...operation, playlistId: value.playlistId,
        status: 'incomplete', phase: 'visibility', recovery, details: undefined }, token, this.leaseMs);
      return this.finish(draft, adopted, token);
    }
    try { await this.revalidate(draft); }
    catch (error) {
      this.storage.updateOperation({ ...operation, details: { reason: 'library_revalidation_failed' } }, token, this.leaseMs, true);
      throw error;
    }
    const pending = this.storage.updateOperation({ ...operation, status: 'creating', phase: 'create', recovery, details: undefined }, token, this.leaseMs);
    return this.create(draft, pending, token);
  }
}
