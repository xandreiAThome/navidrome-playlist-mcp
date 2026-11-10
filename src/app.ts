import type { Config } from './playlists/domain.ts';
import { Storage } from './database/storage.ts';
import { Navidrome } from './navidrome/client.ts';
import { Publication } from './playlists/publication.ts';
import { PlaylistService } from './playlists/service.ts';
import { AudioMuse } from './discovery/audiomuse.ts';
import { Discovery } from './discovery/service.ts';

export function createApp(config: Config): PlaylistService {
  const storage = new Storage(config);
  try {
    const navidrome = new Navidrome(config);
    const audiomuse = new AudioMuse(config.audiomuse, config.url);
    return new PlaylistService(
      storage,
      navidrome,
      new Publication(storage, navidrome, config),
      audiomuse,
      new Discovery(config.audiomuse, audiomuse, navidrome, storage),
    );
  } catch (error) {
    storage.close();
    throw error;
  }
}
