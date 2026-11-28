import { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { toolSchemas } from '../playlists/domain.ts';
import type { ToolName } from '../playlists/domain.ts';
import type { PlaylistService } from '../playlists/service.ts';

const tools: { name: ToolName; readOnly: boolean; description: string }[] = [
  {
    name: 'save_playlist_update',
    readOnly: false,
    description:
      'Create or edit local append additions and separate reference-only songs. Bind creation to a playlist ID; edits require expectedRevision. Preserve requested occurrences. No remote writes.',
  },
  {
    name: 'get_playlist_update',
    readOnly: true,
    description:
      'Inspect an update draft or immutable historical revision, including target snapshot, additions, references and omissions.',
  },
  {
    name: 'preview_playlist_update',
    readOnly: false,
    description:
      'Record exact update revision review. Shows full resulting order, target metadata, counts, repetition warnings, omissions and discovery shortfalls.',
  },
  {
    name: 'refresh_playlist_update',
    readOnly: false,
    description:
      'Refresh target snapshot after conflict, preserving explicit occurrences and reporting excluded recommendations. Requires a new preview; does not refill recommendations.',
  },
  {
    name: 'expand_playlist_update',
    readOnly: false,
    description:
      'Generate balanced additional recommendations using only reference-only songs. Excludes target, references and selected additions. Regenerate protects retained recommendations; add_more adds another batch. Stable requestKey makes retries idempotent. Shortages are valid outcomes; failures preserve source.',
  },
  {
    name: 'apply_playlist_update',
    readOnly: false,
    description:
      'Append exact previewed additions once to the existing target, preserving metadata. Optional approval refers to exact revision. Conflicts prevent dispatch; uncertain outcomes block target until explicit recovery. Inspect inner status.',
  },
  {
    name: 'get_update_operation',
    readOnly: true,
    description:
      'Inspect immutable update intent, recovery history and current target. Reports original/intended/both/unexpected relationship and metadata, ordered-position and occurrence-count differences. Current contents do not prove causation or that a pending request finished.',
  },
  {
    name: 'reconcile_playlist_update',
    readOnly: false,
    description:
      'Explicit recovery: accept_intended verifies exact result, accept_current closes without success, retry requires didNotApply. Every action requires cannotStillExecute=true and reason. Stable recoveryKey and current recoveryVersion protect retries. Never repairs or rolls back.',
  },
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
      'Recommend tracks similar to one library track that meet the similarity quality cutoff, with alternate-version filtering. Ambiguous analysis failures are errors, not shortages.',
  },
  {
    name: 'check_audiomuse_connection',
    readOnly: true,
    description:
      'Check optional AudioMuse authentication, version, and each scale’s calibration (similarity, description): calibrated with its quality cutoff, missing, or stale with the changes that made it stale. Recalibrate a missing or stale scale before using it. Does not analyze the library.',
  },
  {
    name: 'reset_calibration',
    readOnly: false,
    description:
      'Mark one scale’s calibration stale after an AudioMuse model or index change that cannot be detected, so recommendations on that scale report calibration_required until it is recalibrated. Starts fresh calibration ratings when a calibration was saved; earlier ratings and calibrations are kept as history. Only reset when the user reports such a change.',
  },
  {
    name: 'collect_calibration_candidates',
    readOnly: true,
    description:
      'Collect candidates for a calibration probe: a library track ID (similarity scale) or a listening description (description scale). Works before calibration and returns raw scores (distance, lower is closer; similarity, higher is closer) with no quality cutoff, each validated against the library. Have the user listen in Navidrome and rate each candidate good or poor. When evidence is short, such as no poor rating yet, use nextOffset to collect further down the list or try another probe.',
  },
  {
    name: 'record_calibration_ratings',
    readOnly: false,
    description:
      "Record the user's good or poor calibration ratings for one probe, echoing each candidate's trackId, title, artist, and score as collected. Ratings are trusted as the user's own judgment; record only what the user said after listening. Re-rating a candidate replaces its rating. Returns the scale's ratings collected toward the next calibration, in the same trackId, title, and artist terms. Local only.",
  },
  {
    name: 'propose_calibration',
    readOnly: true,
    description:
      'Propose a quality cutoff for one scale from its recorded ratings without saving it. Similarity: the largest good distance below the smallest poor distance; description: the smallest good similarity above the largest poor similarity; cutoffs are inclusive. Needs at least one good and one poor rating across at least three probes; when the result is insufficient, collect candidates further down the list or for another probe and propose again. Show the user which rated candidates the cutoff accepts and rejects, and save it only after they agree. Local only.',
  },
  {
    name: 'save_calibration',
    readOnly: false,
    description:
      'Save a quality cutoff for one scale, bound to the live AudioMuse URL, selected server, Navidrome URL, and release. With evidence "ratings", save exactly the cutoff propose_calibration returned after the user agreed; it is rejected if the proposal changed. With evidence "note", save an explicit cutoff without ratings, such as one moved from an old calibration file, recording where it came from in note. Saving from ratings starts fresh ratings; a note leaves ratings in progress counting toward the next proposal. Afterwards, suggest (do not require) testing recommendations for a probe the user has not rated.',
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
              'reset_calibration',
              'record_calibration_ratings',
            ].includes(tool.name),
          openWorldHint: ![
            'get_playlist_draft',
            'get_operation',
            'copy_playlist_draft',
            'preview_playlist',
            'reset_calibration',
            'record_calibration_ratings',
            'propose_calibration',
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
