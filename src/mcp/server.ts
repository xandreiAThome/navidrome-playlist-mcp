import { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { toolSchemas } from '../playlists/domain.ts';
import type { ToolName } from '../playlists/domain.ts';
import type { PlaylistService } from '../playlists/service.ts';

const tools: { name: ToolName; readOnly: boolean; description: string }[] = [
  {
    name: 'configure_playlist_discovery',
    readOnly: false,
    description:
      'Set the complete retained-recommendation list and/or explicit reference-track set for an expected revision. Excluding an original from references keeps it in the playlist. Retain a recommendation before adding it as a reference. Omitted fields preserve existing choices.',
  },
  {
    name: 'expand_playlist_draft',
    readOnly: false,
    description:
      'Expand a fully resolved draft with balanced recommendations. Choose regenerate to replace unretained additions or add_more for another batch. Reuse requestKey with identical input for transport retries. Failures preserve the source revision.',
  },
  {
    name: 'find_similar_tracks',
    readOnly: true,
    description:
      'Recommend tracks similar to one library track, with a calibrated quality floor and alternate-version filtering. Ambiguous analysis failures are errors, not shortages.',
  },
  {
    name: 'check_audiomuse_connection',
    readOnly: true,
    description:
      'Check optional AudioMuse authentication, version, and calibration configuration. Does not analyze the library.',
  },
  {
    name: 'discover_tracks',
    readOnly: true,
    description:
      'Recommend Navidrome library tracks from a listening description using AudioMuse. Reports shortages; recommendations are not requested-song candidate matches. Save accepted recommendations into a draft, then preview and publish.',
  },
  {
    name: 'check_connection',
    readOnly: true,
    description: 'Check Navidrome connectivity and authentication without exposing credentials.',
  },
  {
    name: 'search_tracks',
    readOnly: true,
    description:
      'Discover library tracks. complete=false means search limits were reached; do not infer uniqueness or absence.',
  },
  {
    name: 'resolve_tracks',
    readOnly: true,
    description:
      'Resolve ordered requested-song occurrences. Select clear matches; return ambiguous, missing, or incomplete candidates otherwise.',
  },
  {
    name: 'list_playlists',
    readOnly: true,
    description: 'List existing Navidrome playlists. Names are not unique identities.',
  },
  {
    name: 'get_playlist',
    readOnly: true,
    description: 'Read an existing playlist by ID, including ordered tracks and visibility.',
  },
  {
    name: 'save_playlist_draft',
    readOnly: false,
    description:
      'Create or replace an editable draft. Edits require expectedRevision; entries choose trackId, omit=true, or automatic resolution. Preserve recommendation metadata when accepting discovery results; recommendation=null explicitly makes a selected recording supplied. Defaults to public.',
  },
  {
    name: 'get_playlist_draft',
    readOnly: true,
    description: 'Read the current draft or a stored historical revision.',
  },
  {
    name: 'copy_playlist_draft',
    readOnly: false,
    description:
      'Copy a specific revision into a new editable draft for an intentional additional playlist. Requires its own preview before publishing.',
  },
  {
    name: 'preview_playlist',
    readOnly: false,
    description:
      'Present and record a preview of the exact current revision. Review name, visibility, selections and omissions before publishing.',
  },
  {
    name: 'publish_playlist',
    readOnly: false,
    description:
      'Publish a previewed revision once. Persist operationKey across retries. Optional approval asserts human approval of that exact revision. Inspect the returned operation status.',
  },
  {
    name: 'get_operation',
    readOnly: true,
    description:
      'Read publication outcome, known playlist ID, and recoveryVersion. An expired worker lease becomes an unknown or incomplete outcome.',
  },
  {
    name: 'reconcile_operation',
    readOnly: false,
    description:
      'Recover deliberately: adopt requires a specified playlistId and reason; confirm_not_created requires an explicit non-creation assertion in reason; resume finishes a known playlist. Use a stable recoveryKey and current recoveryVersion. Never infer non-creation from a name.',
  },
];

export function createMcpServer(service: PlaylistService): McpServer {
  const server = new McpServer({ name: 'navidrome-mcp', version: '0.1.0' });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolSchemas[tool.name] as z.ZodType,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint:
            tool.readOnly ||
            [
              'preview_playlist',
              'publish_playlist',
              'reconcile_operation',
              'expand_playlist_draft',
            ].includes(tool.name),
          openWorldHint: ![
            'get_playlist_draft',
            'get_operation',
            'copy_playlist_draft',
            'preview_playlist',
          ].includes(tool.name),
        },
      },
      async (input) => {
        const result = await service.execute(tool.name, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
          isError: result.status !== 'ok',
        };
      },
    );
  }
  return server;
}
