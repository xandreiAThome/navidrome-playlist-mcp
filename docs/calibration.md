# Calibrate AudioMuse recommendations

Calibration tells this service which recommendation scores are good enough for
**your** library. No default quality cutoffs ship: AudioMuse scores depend on its
models, index, and library, so a value from another installation means nothing
here. Until a scale is calibrated, recommendations on it return
`calibration_required`; explicit song lists keep working.

To start, ask your assistant to calibrate recommendations. It runs the whole
process with you in conversation through the calibration tools; there are no
scripts to run.

## Two scales

Recommendations use two independent scales, each with its own quality cutoff:

- **Similarity** (`find_similar_tracks` and expansion): a distance from a library
  track. Lower is closer; the cutoff is the largest distance accepted.
- **Description** (`discover_tracks`): a similarity to a listening description.
  Higher is closer; the cutoff is the smallest similarity accepted.

Both cutoffs are inclusive. Calibrate, save, and reset each scale separately; you
can calibrate similarity first and use similar-song features while description
search still reports `calibration_required`.

## How calibration works

1. **Probes.** You choose calibration probes: library tracks you know well for the
   similarity scale, or descriptions you would actually ask for, such as "calm
   instrumental jazz", for the description scale. Cover the styles you listen to,
   including mixed contexts.
2. **Candidates.** The assistant collects candidates for each probe with their raw
   scores. Collection works before calibration, applies no cutoff, and checks each
   candidate against your Navidrome library.
3. **Ratings.** You listen in Navidrome and rate each candidate good or poor. The
   service trusts these calibration ratings as your judgment, so rate only what
   you have heard. Scores alone are not a judgment, and membership in an existing
   playlist doesn't prove a match is good or bad.
4. **Proposal.** The service proposes a cutoff: the loosest value that still
   rejects every poor rating. It needs at least one good and one poor rating across
   at least three probes. If the ratings fall short, or good and poor candidates
   don't separate, the assistant collects candidates further down the list or for
   another probe. You see which rated candidates the proposed cutoff accepts and
   rejects before anything is saved.
5. **Save.** Once you agree, the assistant saves the proposed cutoff. Your ratings
   are kept as its evidence. Afterwards, it may suggest trying recommendations for
   a probe you haven't rated, as a check.

A cutoff never loosens to fill a requested count: recommendations that miss it
are reported as a shortfall.

`check_audiomuse_connection` reports each scale as `missing`, `calibrated` with its
cutoff, or `stale` with what changed.

## When to recalibrate

A calibration belongs to the deployment it was measured on. It becomes stale, and
recommendations on that scale return `calibration_required`, when any of these
change:

- the AudioMuse URL;
- the selected AudioMuse media server;
- the Navidrome URL;
- the AudioMuse minor release, such as 3.7 to 3.8. Patch releases within the same
  minor release keep calibration.

AudioMuse doesn't report model or index changes, so the service can't detect them.
After you change models, analysis or index settings, or the distance metric, or
after a large library change, ask your assistant to reset the affected scale. Reset
marks it stale until you recalibrate.

Saving from ratings or resetting a calibrated scale starts fresh ratings. Earlier
ratings and calibrations stay in the local database as history. Saving a cutoff
with a note leaves ratings in progress counting toward the next proposal.

## Moving cutoffs from a calibration file

Earlier versions read cutoffs from a JSON file named by `AUDIOMUSE_CALIBRATION_PATH`.
That setting is now ignored: it neither loads the file nor stops startup, and both
scales report `missing` until calibrated.

If your file still describes this deployment and its minor release, move its
cutoffs once instead of recalibrating. Ask your assistant to save each one with a
note recording where it came from:

- the file's `maxDistance` as the similarity cutoff;
- its `minDescriptionSimilarity` as the description cutoff.

The saved cutoffs are bound to the live deployment. Then remove
`AUDIOMUSE_CALIBRATION_PATH` from your configuration; you can delete the file. If
the file was made on another minor release, or the models or index have changed
since, recalibrate instead.
