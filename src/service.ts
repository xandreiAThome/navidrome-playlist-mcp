import { z } from 'zod';
import { Problem, toolSchemas } from './domain.ts';
import type { Config, Result, Entry, RequestedSong } from './domain.ts';
import { Navidrome } from './navidrome.ts';
import { match } from './matching.ts';
import { Storage } from './storage.ts';
import { Publication } from './publication.ts';

export class PlaylistService {
  private readonly navidrome: Navidrome;
  private readonly storage: Storage;
  private readonly publication: Publication;
  constructor(config: Config) {
    this.navidrome = new Navidrome(config); this.storage = new Storage(config);
    this.publication = new Publication(this.storage, this.navidrome, config);
  }
  close() { this.storage.close(); }

  private async resolveRequestedSong(song: RequestedSong) {
    const found = await this.navidrome.search(song.title);
    return match(song, found.tracks, found.complete);
  }

  async execute(tool: string, input: unknown): Promise<Result> {
    try {
      let data: unknown;
      if (tool === 'publish_playlist') {
        data = await this.publication.publish(input);
      } else if (tool === 'reconcile_operation') {
        data = await this.publication.reconcile(input);
      } else if (tool === 'get_operation') {
        const { operationId } = toolSchemas.get_operation.parse(input);
        data = this.storage.getOperation(operationId);
      } else if (tool === 'list_playlists') {
        toolSchemas.list_playlists.parse(input);
        data = await this.navidrome.listPlaylists();
      } else if (tool === 'get_playlist') {
        const { playlistId } = toolSchemas.get_playlist.parse(input);
        data = await this.navidrome.getPlaylist(playlistId);
      } else if (tool === 'copy_playlist_draft') {
        const value = toolSchemas.copy_playlist_draft.parse(input);
        const source = this.storage.getDraft(value.draftId, value.revision);
        data = this.storage.saveDraft({ name: value.name ?? source.name, visibility: source.visibility, entries: source.entries });
      } else if (tool === 'save_playlist_draft') {
        const value = toolSchemas.save_playlist_draft.parse(input);
        const entries: Entry[] = [];
        for (const entry of value.entries) {
          if (entry.omit) entries.push({ request: entry.request, omit: true });
          else if (entry.trackId) entries.push({ request: entry.request, track: await this.navidrome.getSong(entry.trackId) });
          else {
            const resolution = await this.resolveRequestedSong(entry.request);
            entries.push({ request: entry.request, ...(resolution.track ? { track: resolution.track } : {}), resolution });
          }
        }
        data = this.storage.saveDraft({ name: value.name, visibility: value.visibility, entries }, value.draftId, value.expectedRevision);
      } else if (tool === 'get_playlist_draft') {
        const value = toolSchemas.get_playlist_draft.parse(input);
        data = this.storage.getDraft(value.draftId, value.revision);
      } else if (tool === 'preview_playlist') {
        const value = toolSchemas.preview_playlist.parse(input);
        data = this.storage.preview(value.draftId, value.revision);
      } else if (tool === 'resolve_tracks') {
        const { songs } = toolSchemas.resolve_tracks.parse(input);
        const resolutions = [];
        for (const song of songs) {
          resolutions.push(await this.resolveRequestedSong(song));
        }
        data = { resolutions };
      } else if (tool === 'search_tracks') {
        const { query } = toolSchemas.search_tracks.parse(input);
        data = await this.navidrome.search(query);
      } else if (tool === 'check_connection') {
        toolSchemas.check_connection.parse(input);
        data = await this.navidrome.ping();
      } else throw new Problem('unknown_tool', 'Unknown tool.');
      return { status: 'ok', data };
    } catch (error) {
      if (error instanceof Problem) return { status: error.code, message: error.message, details: error.details };
      if (error instanceof z.ZodError) return { status: 'invalid_input', message: 'Input does not match the tool schema.' };
      return { status: 'internal_error', message: 'The operation could not be completed.' };
    }
  }
}
