import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { draftRefSchema, getDraftSchema, publishSchema, requestedSongSchema, saveDraftSchema, text } from './domain.ts';
import type { PlaylistService } from './service.ts';

const tools = [
  { name: 'check_connection', schema: z.object({}).strict(), readOnly: true,
    description: 'Check Navidrome connectivity and authentication without exposing credentials.' },
  { name: 'search_tracks', schema: z.object({ query: text }).strict(), readOnly: true,
    description: 'Discover library tracks. complete=false means search limits were reached; do not infer uniqueness or absence.' },
  { name: 'resolve_tracks', schema: z.object({ songs: z.array(requestedSongSchema).min(1).max(500) }).strict(), readOnly: true,
    description: 'Resolve ordered requested-song occurrences. Select clear matches; return ambiguous, missing, or incomplete candidates otherwise.' },
  { name: 'list_playlists', schema: z.object({}).strict(), readOnly: true,
    description: 'List existing Navidrome playlists. Names are not unique identities.' },
  { name: 'get_playlist', schema: z.object({ playlistId: text }).strict(), readOnly: true,
    description: 'Read an existing playlist by ID, including ordered tracks and visibility.' },
  { name: 'save_playlist_draft', schema: saveDraftSchema, readOnly: false,
    description: 'Create or replace an editable draft. Edits require expectedRevision; entries choose trackId, omit=true, or automatic resolution. Defaults to public.' },
  { name: 'get_playlist_draft', schema: getDraftSchema, readOnly: true,
    description: 'Read the current draft or a stored historical revision.' },
  { name: 'copy_playlist_draft', schema: draftRefSchema.extend({ name: text.optional() }).strict(), readOnly: false,
    description: 'Copy a specific revision into a new editable draft for an intentional additional playlist. Requires its own preview before publishing.' },
  { name: 'preview_playlist', schema: draftRefSchema, readOnly: false,
    description: 'Present and record a preview of the exact current revision. Review name, visibility, selections and omissions before publishing.' },
  { name: 'publish_playlist', schema: publishSchema, readOnly: false,
    description: 'Publish a previewed revision once. Persist operationKey across retries. Optional approval asserts human approval of that exact revision. Inspect the returned operation status.' },
  { name: 'get_operation', schema: z.object({ operationId: text }).strict(), readOnly: true,
    description: 'Read publication outcome, known playlist ID, and recoveryVersion. An expired worker lease becomes an unknown or incomplete outcome.' },
  { name: 'reconcile_operation', readOnly: false,
    schema: z.object({ operationId: text, action: z.enum(['adopt', 'confirm_not_created', 'resume']),
      recoveryKey: text, expectedRecoveryVersion: z.number().int().nonnegative(),
      playlistId: text.optional(), reason: text.optional() }).strict(),
    description: 'Recover deliberately: adopt requires a specified playlistId and reason; confirm_not_created requires an explicit non-creation assertion in reason; resume finishes a known playlist. Use a stable recoveryKey and current recoveryVersion. Never infer non-creation from a name.' },
];

export function createMcpServer(service: PlaylistService): McpServer {
  const server = new McpServer({ name: 'navidrome-mcp', version: '0.1.0' });
  for (const tool of tools) {
    server.registerTool(tool.name, {
      description: tool.description, inputSchema: tool.schema as z.ZodType,
      annotations: { readOnlyHint: tool.readOnly, destructiveHint: false,
        idempotentHint: tool.readOnly || ['preview_playlist', 'publish_playlist', 'reconcile_operation'].includes(tool.name),
        openWorldHint: !['get_playlist_draft', 'get_operation', 'copy_playlist_draft', 'preview_playlist'].includes(tool.name) },
    }, async input => {
      const result = await service.execute(tool.name, input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result,
        isError: result.status !== 'ok' };
    });
  }
  return server;
}
