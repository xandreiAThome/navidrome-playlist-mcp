// AudioMuse releases this adapter supports: any patch of one validated minor
// release. Calibration stays valid across patches and is stale across minors.
// With a single supported minor, config and the deployment check each reject other
// minors, so no calibration/deployment comparison is needed; supporting a second
// minor would reintroduce a `releaseMinor` comparison in discovery.
export const supportedAudioMuse = { minor: '3.7', validatedBaseline: 'v3.7.4' } as const;

// Canonical digit groups only (no leading zeros), so `major.minor` compares as a string.
const releasePattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** The `major.minor` of a canonical `vMAJOR.MINOR.PATCH` release, or undefined when malformed. */
export const releaseMinor = (version: string): string | undefined => {
  const match = releasePattern.exec(version);
  return match ? `${match[1]}.${match[2]}` : undefined;
};

export const isSupportedRelease = (version: string) =>
  releaseMinor(version) === supportedAudioMuse.minor;

export const supportedReleaseMessage = `This adapter supports AudioMuse ${supportedAudioMuse.minor}.x releases, validated against ${supportedAudioMuse.validatedBaseline}`;
