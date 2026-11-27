// AudioMuse releases this adapter supports: any patch of one validated minor
// release. Calibration stays valid across patches and is stale across minors.
export const supportedAudioMuse = { minor: '3.7', validatedBaseline: 'v3.7.4' } as const;

const releasePattern = /^v(\d+)\.(\d+)\.(\d+)$/;

/** The `major.minor` of a `vMAJOR.MINOR.PATCH` release, or undefined when malformed. */
export const releaseMinor = (version: string): string | undefined => {
  const match = releasePattern.exec(version);
  return match ? `${Number(match[1])}.${Number(match[2])}` : undefined;
};

export const isSupportedRelease = (version: string) =>
  releaseMinor(version) === supportedAudioMuse.minor;

export const supportedReleaseMessage = `This adapter supports AudioMuse ${supportedAudioMuse.minor}.x releases, validated against ${supportedAudioMuse.validatedBaseline}`;
