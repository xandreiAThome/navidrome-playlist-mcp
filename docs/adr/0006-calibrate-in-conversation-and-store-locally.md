# Calibrate recommendations in conversation and store calibration locally

Calibration replaces the operator-managed calibration file and
`AUDIOMUSE_CALIBRATION_PATH` with MCP tools: the agent collects candidates for
calibration probes, the user rates them in conversation, the service proposes a
quality cutoff per scale, and a separate save stores it in local storage with the
ratings as evidence. The scripted Bash/curl/jq procedure was the main obstacle to
enabling recommendations, did not work natively on Windows, and required a manually
maintained absolute path.

Calibration remains mandatory: no default quality cutoffs ship, preserving the
AudioMuse spec's rule that cutoffs are empirical. A proposed cutoff is the loosest
value that still rejects every poor rating, and requires at least one good and one
poor rating across at least three probes for that scale. Similarity and description
scales are calibrated, saved, and reset independently. Ratings are trusted agent
input, like approval assertions.

Calibration is bound to the configured AudioMuse URL, selected server, Navidrome
URL, and AudioMuse minor release; a change to any of these makes it stale. Patch
releases within the same minor release keep calibration. Model or index changes are
undetectable, so a reset tool marks calibration stale explicitly. Recalibration
collects fresh ratings and keeps earlier ones as history.

This extends ADR 0003: discovery infrastructure stays separately managed, while
local storage now owns calibration alongside draft and operation state.
