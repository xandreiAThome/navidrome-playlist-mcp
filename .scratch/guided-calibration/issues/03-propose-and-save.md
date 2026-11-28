# Add propose and save tools for quality cutoffs

Status: done
Blocked by: 02

Implement the proposal rule and minimum-evidence check, the accept/reject breakdown,
and the separate save call.

## Comments

- Done: added `propose_calibration` (read-only, local; inclusive-cutoff rule, minimum evidence of one good and one poor rating across three probes, accept/reject breakdown) and `save_calibration` (`evidence: "ratings"` saves only the current proposal; `evidence: "note"` saves an explicit cutoff with a required note), both bound to the live deployment. Tests in `tests/integration/calibration-proposal.test.ts`.
