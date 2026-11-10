import type { Config } from './playlists/domain.ts';
import { Storage } from './database/storage.ts';
import { Navidrome } from './navidrome/client.ts';
import { Publication } from './playlists/publication.ts';
import { PlaylistService } from './playlists/service.ts';

export function createApp(config: Config): PlaylistService {
  const storage = new Storage(config);
  try {
    const navidrome = new Navidrome(config);
    return new PlaylistService(storage, navidrome, new Publication(storage, navidrome, config));
  } catch (error) {
    storage.close();
    throw error;
  }
}
