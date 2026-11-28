// Expected domain failures and the JSON details they carry.

export type ProblemCode =
  | 'target_changed'
  | 'audiomuse_unavailable'
  | 'audiomuse_error'
  | 'analysis_unavailable'
  | 'calibration_required'
  | 'discovery_timeout'
  | 'configuration_error'
  | 'not_found'
  | 'stale_revision'
  | 'draft_locked'
  | 'operation_key_conflict'
  | 'preview_required'
  | 'operation_busy'
  | 'operation_changed'
  | 'stale_recovery'
  | 'navidrome_error'
  | 'approval_required'
  | 'unresolved_songs'
  | 'empty_playlist'
  | 'library_changed'
  | 'recovery_key_conflict'
  | 'invalid_recovery'
  | 'adoption_mismatch'
  | 'unknown_tool'
  | 'invalid_input'
  | 'internal_error';
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export class Problem extends Error {
  readonly code: ProblemCode;
  readonly details: Json | undefined;
  constructor(code: ProblemCode, message: string, details?: Json) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
