import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export const AUDIOMUSE_TOKEN = 'secret-audiomuse-token';

export type MediaServer = {
  server_id: string;
  name: string;
  server_type: string;
  creds?: { url: string };
};

type Row = { item_id: string; title: string; author: string; similarity: number; distance: number };

/**
 * A fake AudioMuse deployment. Every request needs the Bearer token. Discovery
 * endpoints also need `server=navidrome`; the version and server listings, which
 * setup calls before it knows the server, accept requests without one.
 */
export async function audioMuseFixture() {
  const controls = {
    onSimilarity: undefined as (() => Promise<void>) | undefined,
    onVersion: undefined as (() => Promise<void>) | undefined,
    onServers: undefined as (() => Promise<void>) | undefined,
    navidromeUrl: '',
    /** Replaces the default single `navidrome` entry pointing at `navidromeUrl`. */
    servers: undefined as MediaServer[] | undefined,
    version: 'v3.7.4' as unknown,
    fail: false,
    analysisFails: false,
    byReference: {} as Record<string, Row[]>,
    /** Description-search results per query; other queries get `rows`. */
    byQuery: {} as Record<string, Row[]>,
    rows: [] as Row[],
  };
  const servers = (): MediaServer[] =>
    controls.servers ?? [
      {
        server_id: 'navidrome',
        name: 'Fixture',
        server_type: 'navidrome',
        creds: { url: controls.navidromeUrl },
      },
    ];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    let body = '';
    for await (const chunk of req) body += String(chunk);
    const search = (body ? JSON.parse(body) : {}) as { query?: string; limit?: number };
    const listing = url.pathname === '/api/version' || url.pathname === '/api/servers';
    const selected = url.searchParams.get('server');
    if (
      req.headers.authorization !== `Bearer ${AUDIOMUSE_TOKEN}` ||
      (selected === null ? !listing : selected !== 'navidrome')
    ) {
      res.writeHead(401).end();
      return;
    }
    if (url.pathname === '/api/similar_tracks') await controls.onSimilarity?.();
    if (url.pathname === '/api/version') await controls.onVersion?.();
    if (url.pathname === '/api/servers') await controls.onServers?.();
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = controls.fail
      ? 401
      : controls.analysisFails && url.pathname === '/api/max_distance'
        ? 404
        : 200;
    res.end(
      JSON.stringify(
        controls.fail
          ? { error: AUDIOMUSE_TOKEN }
          : url.pathname === '/api/servers'
            ? { servers: servers() }
            : url.pathname === '/api/clap/search'
              ? {
                  results: (controls.byQuery[search.query!] ?? controls.rows).slice(
                    0,
                    search.limit,
                  ),
                }
              : url.pathname === '/api/similar_tracks'
                ? (controls.byReference[url.searchParams.get('item_id')!] ?? controls.rows).slice(
                    0,
                    Number(url.searchParams.get('n')),
                  )
                : url.pathname === '/api/max_distance'
                  ? { max_distance: 1 }
                  : { app_version: controls.version },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    controls,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
