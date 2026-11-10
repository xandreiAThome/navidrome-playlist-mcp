import type { RequestedSong, Resolution, Track } from './domain.ts';

export function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function baseTitle(value: string): string {
  let title = value.trim();
  let previous: string;
  do {
    previous = title;
    title = title.replace(/\s*[([][^)\]]+[)\]]\s*$/, '').trim();
  } while (title !== previous);
  // Treat subtitles conservatively as possible versions, including unfamiliar
  // names such as "Extended". Full requested titles still require exact matches.
  return normalize(title.replace(/\s+[-–—]\s+.+$/, ''));
}

export function match(request: RequestedSong, tracks: Track[], complete: boolean): Resolution {
  const explicitTitleVersion = baseTitle(request.title) !== normalize(request.title);
  const candidates = tracks.filter(track => normalize(track.artist) === normalize(request.artist)
    && baseTitle(track.title) === baseTitle(request.title)
    && (!explicitTitleVersion || normalize(track.title) === normalize(request.title))
    && (!request.album || normalize(track.album ?? '') === normalize(request.album))
    && (!request.version || ` ${normalize(track.title)} `.includes(` ${normalize(request.version)} `))
    && (request.duration === undefined || (track.duration !== undefined && Math.abs(track.duration - request.duration) <= 2)));
  if (!complete) return { status: 'incomplete', candidates };
  const single = candidates.length === 1 ? candidates[0] : undefined;
  if (single && (normalize(single.title) === normalize(request.title) || request.version)) {
    return { status: 'selected', track: single, candidates };
  }
  return { status: candidates.length ? 'ambiguous' : 'missing', candidates };
}
