import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export type Song = { id: string; title: string; artist: string; album?: string; duration?: number };
export type RemotePlaylist = { id: string; name: string; public: boolean; entry: Song[] };

/** A real HTTP boundary, deliberately independent of the application's client. */
export async function navidromeFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'navidrome-mcp-'));
  const songs: Song[] = [
    { id: 'studio', title: 'Hallelujah', artist: 'Jeff Buckley', album: 'Grace', duration: 413 },
    {
      id: 'live',
      title: 'Hallelujah (Live)',
      artist: 'Jeff Buckley',
      album: 'Live',
      duration: 420,
    },
    { id: 'other', title: 'Teardrop', artist: 'Massive Attack', album: 'Mezzanine', duration: 330 },
  ];
  const playlists: RemotePlaylist[] = [];
  const controls = {
    omitPrivateVisibility: false,
    serverType: '',
    serverVersion: '',
    minimalPlaylistResponse: false,
    dropCreateResponse: false,
    visibilityFails: false,
    dropLastTrack: false,
    delayCreateMs: 0,
    searchRepeatsPage: false,
    leakError: false,
    visibilityIgnored: false,
    creationRequests: 0,
    appendRequests: 0,
    dropAppendResponse: false,
    dropBeforeAppend: false,
    failVerificationRead: false,
    denyAppend: false,
    onAppend: undefined as (() => void | Promise<void>) | undefined,
    onGetSong: undefined as (() => void | Promise<void>) | undefined,
    delayAppendMs: 0,
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const p = url.searchParams;
    const endpoint = url.pathname.split('/').at(-1)!.replace('.view', '');
    const send = (body: object) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            type: controls.serverType,
            serverVersion: controls.serverVersion,
            ...body,
          },
        }),
      );
    };
    const fail = () =>
      res.end(
        JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: { code: 70, message: 'secret-password token=secret-token' },
          },
        }),
      );
    const expectedToken = createHash('md5')
      .update(`secret-password${p.get('s') ?? ''}`)
      .digest('hex');
    if (
      p.get('u') !== 'tester' ||
      !p.get('s') ||
      p.get('t') !== expectedToken ||
      p.get('f') !== 'json'
    ) {
      fail();
      return;
    }
    if (controls.leakError) {
      fail();
      return;
    }
    if (endpoint === 'ping') {
      send({});
      return;
    }
    if (endpoint === 'search3') {
      // Deliberately return broad candidates: matching is the service's job.
      const offset = controls.searchRepeatsPage ? 0 : Number(p.get('songOffset') ?? 0);
      const count = Number(p.get('songCount') ?? 100);
      send({ searchResult3: { song: songs.slice(offset, offset + count) } });
      return;
    }
    if (endpoint === 'getSong') {
      await controls.onGetSong?.();
      const song = songs.find((s) => s.id === p.get('id'));
      if (song) send({ song });
      else fail();
      return;
    }
    const playlistResponse = (playlist: RemotePlaylist) => {
      const { public: visibility, ...rest } = playlist;
      return {
        ...rest,
        ...(controls.omitPrivateVisibility && !visibility ? {} : { public: visibility }),
        ...(controls.serverType === 'navidrome' && !controls.minimalPlaylistResponse
          ? { owner: 'tester', readonly: false }
          : {}),
      };
    };
    if (endpoint === 'getPlaylists') {
      send({ playlists: { playlist: playlists.map(playlistResponse) } });
      return;
    }
    if (endpoint === 'getPlaylist') {
      if (controls.failVerificationRead && controls.appendRequests > 0) {
        fail();
        return;
      }
      const playlist = playlists.find((v) => v.id === p.get('id'));
      if (playlist) send({ playlist: playlistResponse(playlist) });
      else fail();
      return;
    }
    if (endpoint === 'createPlaylist') {
      controls.creationRequests++;
      const entries = p.getAll('songId').flatMap((id) => songs.filter((s) => s.id === id));
      if (controls.dropLastTrack) entries.pop();
      const playlist = {
        id: `p${playlists.length + 1}`,
        name: p.get('name')!,
        public: false,
        entry: entries,
      };
      if (controls.delayCreateMs) await new Promise((r) => setTimeout(r, controls.delayCreateMs));
      playlists.push(playlist);
      if (controls.dropCreateResponse) {
        res.destroy();
        return;
      }
      send({ playlist });
      return;
    }
    if (endpoint === 'updatePlaylist') {
      if (controls.visibilityFails) {
        fail();
        return;
      }
      const playlist = playlists.find((v) => v.id === p.get('playlistId'));
      if (!playlist) {
        fail();
        return;
      }
      if (p.has('songIdToAdd')) {
        controls.appendRequests++;
        if (controls.denyAppend) {
          fail();
          return;
        }
        if (controls.dropBeforeAppend) {
          res.destroy();
          return;
        }
        await controls.onAppend?.();
        if (
          [...p.keys()].some((k) =>
            ['name', 'public', 'comment', 'songIndexToRemove', 'songId'].includes(k),
          )
        ) {
          fail();
          return;
        }
        if (controls.delayAppendMs) await new Promise((r) => setTimeout(r, controls.delayAppendMs));
        const additions = p.getAll('songIdToAdd').flatMap((id) => songs.filter((s) => s.id === id));
        if (controls.dropLastTrack) additions.pop();
        playlist.entry.push(...additions);
        if (controls.dropAppendResponse) {
          res.destroy();
          return;
        }
        send({});
        return;
      }
      if (!controls.visibilityIgnored) playlist.public = p.get('public') === 'true';
      send({});
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture address');
  return {
    directory,
    songs,
    playlists,
    controls,
    config: {
      url: `http://127.0.0.1:${address.port}`,
      username: 'tester',
      password: 'secret-password',
      databasePath: join(directory, 'state.sqlite'),
      requireApproval: false,
      timeoutMs: 1000,
      searchPageSize: 100,
      searchMaxPages: 10,
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await rm(directory, { recursive: true, force: true });
    },
  };
}
