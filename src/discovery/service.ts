import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Storage } from '../database/storage.ts';
import { Problem } from '../playlists/domain.ts';
import type {
  Config,
  DiscoveryResult,
  RecommendedTrack,
  Track,
  ToolInput,
  ExpansionResult,
  Draft,
} from '../playlists/domain.ts';
import type { Navidrome } from '../navidrome/client.ts';
import type { AudioMuse } from './audiomuse.ts';

const rowSchema = z.object({
  item_id: z.string().min(1).max(500),
  title: z.string().min(1),
  author: z.string().min(1),
  similarity: z.number().finite().optional(),
  distance: z.number().finite().nonnegative().optional(),
});
type Row = z.infer<typeof rowSchema>;
const alternateWarning =
  'Alternate-recording filtering uses matching artist and normalized recording titles; uncertain identities remain for review. Similar titles alone do not establish identity.';
const recordingTitle = (title: string) =>
  normalize(title)
    .replace(
      /\s*[([][^)\]]*(?:live|remaster|acoustic|radio edit|instrumental|remix)[^)\]]*[)\]]/g,
      '',
    )
    .replace(/\s+-\s+.*(?:live|remaster|acoustic|radio edit|instrumental|remix).*$/, '')
    .trim();
const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g, ' ');

export class Discovery {
  constructor(
    private readonly config: Config['audiomuse'],
    private readonly audiomuse: AudioMuse,
    private readonly navidrome: Navidrome,
    private readonly storage: Storage,
  ) {}

  private async start() {
    if (!this.config)
      throw new Problem('audiomuse_unavailable', 'Configure AudioMuse to use discovery.');
    const calibration = this.config.calibration;
    if (!calibration)
      throw new Problem(
        'calibration_required',
        'Discovery requires a calibration report and quality thresholds for this deployment and index/model.',
      );
    const signal = AbortSignal.timeout(this.config.budgetMs);
    const version = z
      .object({ app_version: z.literal(calibration.version) })
      .safeParse(await this.audiomuse.request('/api/version', signal));
    if (!version.success)
      throw new Problem(
        'calibration_required',
        'AudioMuse version differs from the calibrated version; validate the adapter and recalibrate.',
      );
    if (calibration.version !== 'v3.7.1')
      throw new Problem(
        'calibration_required',
        'This adapter has been validated against AudioMuse v3.7.1; validate compatibility before using another version.',
      );
    await this.audiomuse.verifyServer(signal);
    return { signal, calibration };
  }

  private async validate(
    row: Row,
    signal: AbortSignal,
    kind: 'description' | 'similarity',
    referenceTrackId?: string,
  ): Promise<RecommendedTrack> {
    const track = await this.navidrome.getSong(row.item_id, signal);
    if (
      normalize(track.title) !== normalize(row.title) ||
      normalize(track.artist) !== normalize(row.author)
    ) {
      throw new Problem(
        'library_changed',
        'AudioMuse results do not match the configured Navidrome library; check media-server selection and refresh analysis.',
        { trackId: row.item_id },
      );
    }
    if (signal.aborted)
      throw new Problem(
        'discovery_timeout',
        'The overall discovery time budget was exhausted; the draft is unchanged.',
      );
    return {
      track,
      recommendation: {
        kind,
        referenceTrackId,
        score: (kind === 'description' ? row.similarity : row.distance)!,
        retained: false,
        uncertainAlternate: false,
      },
    };
  }

  private async neighbors(track: Track, limit: number, signal: AbortSignal): Promise<Row[]> {
    try {
      const availability = z.object({ max_distance: z.number().finite().nonnegative() }).safeParse(
        await this.audiomuse.request('/api/max_distance', signal, undefined, {
          item_id: track.id,
        }),
      );
      if (!availability.success) throw new Error('Invalid availability evidence');
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Problem(
        'analysis_unavailable',
        'Cannot establish usable analysis for this reference track; check the index or explicitly change the reference set.',
        { trackId: track.id, availability: 'unknown' },
      );
    }
    let body: unknown;
    try {
      body = await this.audiomuse.request('/api/similar_tracks', signal, undefined, {
        item_id: track.id,
        n: String(limit),
        eliminate_duplicates: 'false',
        radius_similarity: 'false',
        mood_similarity: 'false',
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Problem(
        'analysis_unavailable',
        'Similarity search failed for this reference track; no matches and missing analysis cannot be distinguished safely.',
        { trackId: track.id, availability: 'unknown' },
      );
    }
    const parsed = z
      .array(rowSchema.extend({ distance: z.number().finite().nonnegative() }))
      .max(limit)
      .safeParse(body);
    if (!parsed.success)
      throw new Problem('audiomuse_error', 'AudioMuse returned invalid similarity results.', {
        trackId: track.id,
      });
    return parsed.data.sort((a, b) => a.distance - b.distance);
  }

  private async recommend(
    references: Track[],
    count: number,
    excluded: Set<string>,
    originals: Track[],
    allowAlternates: boolean,
    signal: AbortSignal,
    maxDistance: number,
  ): Promise<DiscoveryResult> {
    const limit = Math.min(200, Math.floor(5000 / references.length));
    const queues: Row[][] = [];
    // Sequential requests deliberately bound concurrency; all work shares one deadline.
    for (const reference of references) queues.push(await this.neighbors(reference, limit, signal));
    const candidateLimitReached = queues.some((rows) => rows.length === limit);
    const recommendations: RecommendedTrack[] = [];
    const seen = new Set(excluded);
    while (recommendations.length < count) {
      let added = false;
      for (const [index, queue] of queues.entries()) {
        while (queue.length) {
          const row = queue.shift()!;
          if (seen.has(row.item_id) || row.distance! > maxDistance) continue;
          const base = recordingTitle(row.title);
          const sameTitle = originals.filter((original) => recordingTitle(original.title) === base);
          if (
            !allowAlternates &&
            sameTitle.some((original) => normalize(original.artist) === normalize(row.author))
          )
            continue;
          const selected = await this.validate(row, signal, 'similarity', references[index]!.id);
          selected.recommendation.uncertainAlternate = sameTitle.length > 0;
          recommendations.push(selected);
          seen.add(row.item_id);
          added = true;
          break;
        }
        if (recommendations.length === count) break;
      }
      if (!added) break;
    }
    return {
      recommendations,
      target: count,
      shortfall: count - recommendations.length,
      candidateLimitReached,
      warnings: [alternateWarning],
    };
  }

  configure(input: ToolInput<'configure_playlist_discovery'>): Draft {
    const source = this.storage.getDraft(input.draftId);
    if (source.revision !== input.revision)
      throw new Problem('stale_revision', 'Reload the draft before configuring discovery.');
    if (source.update) throw new Problem('invalid_input', 'Use the update tools.');
    const retained = input.retainedTrackIds ? new Set(input.retainedTrackIds) : undefined;
    if (
      retained &&
      [...retained].some(
        (id) =>
          !source.entries.some(
            (entry) => entry.track?.id === id && entry.recommendation && !entry.omit,
          ),
      )
    )
      throw new Problem('invalid_input', 'Only selected recommendations can be retained.');
    const entries = source.entries.map((entry) =>
      entry.recommendation && retained
        ? {
            ...entry,
            recommendation: { ...entry.recommendation, retained: retained.has(entry.track!.id) },
          }
        : entry,
    );
    const referenceTrackIds = input.referenceTrackIds
      ? [...new Set(input.referenceTrackIds)]
      : source.referenceTrackIds;
    if (
      referenceTrackIds?.some(
        (id) =>
          !entries.some(
            (entry) =>
              entry.track?.id === id &&
              !entry.omit &&
              (!entry.recommendation || entry.recommendation.retained),
          ),
      )
    )
      throw new Problem(
        'invalid_input',
        'References must be selected supplied tracks or retained recommendations.',
      );
    return this.storage.saveDraft(
      { name: source.name, visibility: source.visibility, entries, referenceTrackIds },
      source.id,
      source.revision,
    );
  }

  async expand(input: ToolInput<'expand_playlist_draft'>): Promise<ExpansionResult> {
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = this.storage.expansionReceipt(input.requestKey, fingerprint);
    if (previous) return previous;
    const source = this.storage.getDraft(input.draftId);
    if (source.update) throw new Problem('invalid_input', 'Use update expansion.');
    if (source.revision !== input.revision)
      throw new Problem('stale_revision', 'Reload the draft before expansion.');
    if (source.locked) throw new Problem('draft_locked', 'Copy this draft before expanding it.');
    if (source.entries.some((entry) => !entry.omit && !entry.track))
      throw new Problem(
        'unresolved_songs',
        'Resolve or explicitly omit every supplied song before expansion.',
      );
    const originals = source.entries
      .filter((entry) => !entry.recommendation && entry.track && !entry.omit)
      .map((entry) => entry.track!);
    const referenceIds = source.referenceTrackIds ?? [
      ...new Set(originals.map((track) => track.id)),
    ];
    if (!referenceIds.length)
      throw new Problem(
        'invalid_input',
        'Choose at least one selected reference track before expansion.',
      );
    const selected = new Map(
      source.entries
        .filter((entry) => entry.track && !entry.omit)
        .map((entry) => [entry.track!.id, entry.track!]),
    );
    const references = referenceIds.map((id) => {
      const track = selected.get(id);
      if (!track)
        throw new Problem('invalid_input', 'Every reference track must be selected in the draft.', {
          trackId: id,
        });
      return track;
    });
    const target = input.count ?? Math.min(20, new Set(originals.map((track) => track.id)).size);
    const base =
      input.mode === 'add_more'
        ? source.entries
        : source.entries.filter((entry) => !entry.recommendation || entry.recommendation.retained);
    const capacity = Math.max(0, 500 - base.length);
    const { signal, calibration } = await this.start();
    const result = await this.recommend(
      references,
      Math.min(target, capacity),
      new Set(base.flatMap((entry) => (entry.track ? [entry.track.id] : []))),
      originals,
      input.allowAlternateVersions,
      signal,
      calibration.maxDistance,
    );
    if (signal.aborted)
      throw new Problem(
        'discovery_timeout',
        'The overall discovery time budget was exhausted; the draft is unchanged.',
      );
    return this.storage.saveExpansion(
      {
        name: source.name,
        visibility: source.visibility,
        ...(source.referenceTrackIds ? { referenceTrackIds: source.referenceTrackIds } : {}),
        entries: [
          ...base,
          ...result.recommendations.map(({ track, recommendation }) => ({
            request: {
              title: track.title,
              artist: track.artist,
              ...(track.album ? { album: track.album } : {}),
            },
            track,
            recommendation,
          })),
        ],
      },
      source.id,
      source.revision,
      input.requestKey,
      fingerprint,
      {
        target,
        added: result.recommendations.length,
        shortfall: target - result.recommendations.length,
        capacityLimited: target > capacity,
        candidateLimitReached: result.candidateLimitReached,
        warnings: result.warnings,
      },
    );
  }

  async expandUpdate(input: ToolInput<'expand_playlist_update'>): Promise<ExpansionResult> {
    const fingerprint = createHash('sha256')
      .update('update:' + JSON.stringify(input))
      .digest('hex');
    const previous = this.storage.expansionReceipt(input.requestKey, fingerprint);
    if (previous) return previous;
    const source = this.storage.getDraft(input.draftId);
    if (!source.update) throw new Problem('invalid_input', 'Choose an update draft.');
    if (source.revision !== input.revision)
      throw new Problem('stale_revision', 'Reload the update.');
    if (source.locked) throw new Problem('draft_locked', 'This update is locked.');
    if ([...source.entries, ...source.update.references].some((e) => !e.omit && !e.track))
      throw new Problem('unresolved_songs', 'Resolve or omit additions and reference-only songs.');
    const references = [
      ...new Map(
        source.update.references
          .filter((e) => !e.omit && e.track)
          .map((e) => [e.track!.id, e.track!]),
      ).values(),
    ];
    if (!references.length)
      throw new Problem('invalid_input', 'Supply at least one resolved reference.');
    const base =
      input.mode === 'add_more'
        ? source.entries
        : source.entries.filter((e) => !e.recommendation || e.recommendation.retained);
    const target = input.count ?? Math.min(20, references.length);
    const capacity = Math.max(0, 500 - base.length);
    const { signal, calibration } = await this.start();
    const result = await this.recommend(
      references,
      Math.min(target, capacity),
      new Set([
        ...source.update.target.tracks.map((t) => t.id),
        ...references.map((t) => t.id),
        ...base.flatMap((e) => (e.track && !e.omit ? [e.track.id] : [])),
      ]),
      [...references, ...base.flatMap((e) => (e.track && !e.omit ? [e.track] : []))],
      input.allowAlternateVersions,
      signal,
      calibration.maxDistance,
    );
    if (signal.aborted)
      throw new Problem('discovery_timeout', 'Discovery deadline exhausted; draft unchanged.');
    return this.storage.saveExpansion(
      {
        name: source.name,
        visibility: source.visibility,
        update: {
          ...source.update,
          shortfall: target - result.recommendations.length,
          warnings: result.warnings,
        },
        entries: [
          ...base,
          ...result.recommendations.map(({ track, recommendation }) => ({
            request: { title: track.title, artist: track.artist },
            track,
            recommendation,
          })),
        ],
      },
      source.id,
      source.revision,
      input.requestKey,
      fingerprint,
      {
        target,
        added: result.recommendations.length,
        shortfall: target - result.recommendations.length,
        capacityLimited: target > capacity,
        candidateLimitReached: result.candidateLimitReached,
        warnings: result.warnings,
      },
    );
  }

  async similar(
    trackId: string,
    count: number,
    allowAlternateVersions: boolean,
  ): Promise<DiscoveryResult> {
    const { signal, calibration } = await this.start();
    const reference = await this.navidrome.getSong(trackId, signal);
    return this.recommend(
      [reference],
      count,
      new Set([trackId]),
      [reference],
      allowAlternateVersions,
      signal,
      calibration.maxDistance,
    );
  }

  async describe(description: string, count: number): Promise<DiscoveryResult> {
    const { signal, calibration } = await this.start();
    const body = await this.audiomuse.request('/api/clap/search', signal, {
      query: description,
      limit: 200,
    });
    const parsed = z
      .object({ results: z.array(rowSchema.extend({ similarity: z.number().finite() })).max(200) })
      .safeParse(body);
    if (!parsed.success)
      throw new Problem(
        'audiomuse_error',
        'AudioMuse returned invalid description-search results.',
      );
    const recommendations: RecommendedTrack[] = [];
    const seen = new Set<string>();
    for (const row of parsed.data.results.sort((a, b) => b.similarity - a.similarity)) {
      if (row.similarity < calibration.minDescriptionSimilarity || seen.has(row.item_id)) continue;
      recommendations.push(await this.validate(row, signal, 'description'));
      seen.add(row.item_id);
      if (recommendations.length === count) break;
    }
    return {
      recommendations,
      target: count,
      shortfall: count - recommendations.length,
      candidateLimitReached: parsed.data.results.length === 200,
      warnings: [],
    };
  }
}
