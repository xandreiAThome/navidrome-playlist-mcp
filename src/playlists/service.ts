import { z } from 'zod';
import { Problem, toolSchemas } from './domain.ts';
import type {
  Result,
  Entry,
  RequestedSong,
  ToolName,
  ToolInput,
  ToolData,
  ToolHandlers,
} from './domain.ts';
import type { Navidrome } from '../navidrome/client.ts';
import { match } from './matching.ts';
import type { Storage } from '../database/storage.ts';
import type { Publication } from './publication.ts';

export class PlaylistService {
  private readonly handlers: ToolHandlers;
  constructor(
    private readonly storage: Storage,
    navidrome: Navidrome,
    publication: Publication,
  ) {
    const resolve = async (song: RequestedSong) => {
      const found = await navidrome.search(song.title);
      return match(song, found.tracks, found.complete);
    };
    this.handlers = {
      check_connection: () => navidrome.ping(),
      search_tracks: ({ query }) => navidrome.search(query),
      resolve_tracks: async ({ songs }) => {
        const resolutions = [];
        for (const song of songs) resolutions.push(await resolve(song));
        return { resolutions };
      },
      list_playlists: () => navidrome.listPlaylists(),
      get_playlist: ({ playlistId }) => navidrome.getPlaylist(playlistId),
      get_playlist_draft: ({ draftId, revision }) => storage.getDraft(draftId, revision),
      preview_playlist: ({ draftId, revision }) => storage.preview(draftId, revision),
      copy_playlist_draft: ({ draftId, revision, name }) => {
        const source = storage.getDraft(draftId, revision);
        return storage.saveDraft({
          name: name ?? source.name,
          visibility: source.visibility,
          entries: source.entries,
        });
      },
      save_playlist_draft: async (value) => {
        const entries: Entry[] = [];
        for (const entry of value.entries) {
          if (entry.omit) entries.push({ request: entry.request, omit: true });
          else if (entry.trackId)
            entries.push({ request: entry.request, track: await navidrome.getSong(entry.trackId) });
          else {
            const resolution = await resolve(entry.request);
            entries.push({
              request: entry.request,
              ...(resolution.track ? { track: resolution.track } : {}),
              resolution,
            });
          }
        }
        return storage.saveDraft(
          { name: value.name, visibility: value.visibility, entries },
          value.draftId,
          value.expectedRevision,
        );
      },
      publish_playlist: (value) => publication.publish(value),
      get_operation: ({ operationId }) => storage.getOperation(operationId),
      reconcile_operation: (value) => publication.reconcile(value),
    };
  }
  close() {
    this.storage.close();
  }

  private async invoke<K extends ToolName>(tool: K, input: unknown): Promise<ToolData[K]> {
    // The indexed schema and handler share K; TypeScript loses that correlation on parse.
    const parsed = toolSchemas[tool].parse(input) as ToolInput<K>;
    return this.handlers[tool](parsed);
  }

  async execute<K extends ToolName>(tool: K, input: unknown): Promise<Result<ToolData[K]>>;
  async execute(tool: string, input: unknown): Promise<Result>;
  async execute(tool: string, input: unknown): Promise<Result> {
    try {
      if (!Object.hasOwn(toolSchemas, tool)) throw new Problem('unknown_tool', 'Unknown tool.');
      return { status: 'ok', data: await this.invoke(tool as ToolName, input) };
    } catch (error) {
      if (error instanceof Problem)
        return { status: error.code, message: error.message, details: error.details };
      if (error instanceof z.ZodError)
        return { status: 'invalid_input', message: 'Input does not match the tool schema.' };
      return { status: 'internal_error', message: 'The operation could not be completed.' };
    }
  }
}
