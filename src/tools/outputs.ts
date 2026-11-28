import type {
  CalibrationNeed,
  CalibrationRating,
  CalibrationScale,
  CalibrationStatus,
} from '../discovery/records/calibration.ts';
import type {
  CalibrationCandidate,
  DiscoveryResult,
  ExpansionResult,
} from '../discovery/records/results.ts';
import type { RemotePlaylist, Resolution, Track } from '../library.ts';
import type { Draft, UpdatePreview } from '../playlists/records/drafts.ts';
import type {
  Operation,
  UpdateComparison,
  UpdateOperation,
} from '../playlists/records/operations.ts';
import type { Json, ProblemCode } from '../problem.ts';
import type { ToolInput, ToolName } from './inputs.ts';

// The public tool output contract: result data per tool and the result envelope.

export type Result<T = ToolData[ToolName]> =
  | { status: 'ok'; data: T }
  | { status: ProblemCode; message: string; details?: Json; data?: never };
export type ToolData = {
  save_playlist_update: Draft;
  get_playlist_update: Draft;
  preview_playlist_update: UpdatePreview;
  refresh_playlist_update: { draft: Draft; removedTrackIds: string[] };
  expand_playlist_update: ExpansionResult;
  apply_playlist_update: UpdateOperation;
  get_update_operation: {
    operation: UpdateOperation;
    current: RemotePlaylist;
    comparison: UpdateComparison;
    observationWarning: string;
  };
  reconcile_playlist_update: UpdateOperation;
  configure_playlist_discovery: Draft;
  expand_playlist_draft: ExpansionResult;
  find_similar_tracks: DiscoveryResult;
  discover_tracks: DiscoveryResult;
  check_audiomuse_connection: {
    connected: boolean;
    version: string;
    calibration: Record<CalibrationScale, CalibrationStatus>;
  };
  reset_calibration:
    | { scale: CalibrationScale; state: 'missing' }
    | { scale: CalibrationScale; state: 'stale'; cutoff: number; resetAt: string };
  collect_calibration_candidates: {
    scale: CalibrationScale;
    probe: string;
    offset: number;
    candidates: CalibrationCandidate[];
    /** Present when AudioMuse may have more candidates further down the list. */
    nextOffset?: number;
  };
  record_calibration_ratings: { scale: CalibrationScale; ratings: CalibrationRating[] };
  propose_calibration: { scale: CalibrationScale; probes: number; good: number; poor: number } & (
    | { state: 'insufficient'; needs: CalibrationNeed[]; message: string }
    | {
        state: 'proposed';
        cutoff: number;
        /** Rated candidates the cutoff offers, closest first. */
        accepted: CalibrationRating[];
        /** Rated candidates the cutoff withholds, closest first. */
        rejected: CalibrationRating[];
      }
  );
  save_calibration: {
    scale: CalibrationScale;
    state: 'calibrated';
    cutoff: number;
    savedAt: string;
    note?: string;
    suggestion: string;
  };
  check_connection: { connected: boolean };
  search_tracks: { tracks: Track[]; complete: boolean };
  resolve_tracks: { resolutions: Resolution[] };
  list_playlists: {
    playlists: { id: string; name: string; public?: boolean; songCount?: number }[];
  };
  get_playlist: RemotePlaylist;
  save_playlist_draft: Draft;
  get_playlist_draft: Draft;
  copy_playlist_draft: Draft;
  preview_playlist: Draft;
  publish_playlist: Operation;
  get_operation: Operation;
  reconcile_operation: Operation;
};
export type ToolHandlers = {
  [K in ToolName]: (input: ToolInput<K>) => ToolData[K] | Promise<ToolData[K]>;
};
