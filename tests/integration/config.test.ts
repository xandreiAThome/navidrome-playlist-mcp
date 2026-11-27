import { test } from 'vitest';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.ts';

const credentials = {
  NAVIDROME_URL: 'http://localhost:4533',
  NAVIDROME_USERNAME: 'user',
  NAVIDROME_PASSWORD: 'secret',
};

test('Linux defaults the database under XDG_DATA_HOME', () => {
  const config = loadConfig(
    { ...credentials, XDG_DATA_HOME: '/xdg/data' },
    { platform: 'linux', homedir: '/home/user' },
  );
  assert.equal(config.databasePath, '/xdg/data/navidrome-playlist-mcp/playlists.sqlite');
});

test('Linux falls back to ~/.local/share when XDG_DATA_HOME is unset or empty', () => {
  for (const xdg of [{}, { XDG_DATA_HOME: '' }]) {
    const config = loadConfig(
      { ...credentials, ...xdg },
      { platform: 'linux', homedir: '/home/user' },
    );
    assert.equal(
      config.databasePath,
      '/home/user/.local/share/navidrome-playlist-mcp/playlists.sqlite',
    );
  }
});

test('macOS defaults the database under Application Support, ignoring XDG_DATA_HOME', () => {
  const config = loadConfig(
    { ...credentials, XDG_DATA_HOME: '/xdg/data' },
    { platform: 'darwin', homedir: '/Users/user' },
  );
  assert.equal(
    config.databasePath,
    '/Users/user/Library/Application Support/navidrome-playlist-mcp/playlists.sqlite',
  );
});

test('NAVIDROME_DB_PATH overrides the per-user default', () => {
  const config = loadConfig(
    { ...credentials, NAVIDROME_DB_PATH: '/srv/playlists.sqlite', XDG_DATA_HOME: '/xdg/data' },
    { platform: 'linux', homedir: '/home/user' },
  );
  assert.equal(config.databasePath, '/srv/playlists.sqlite');
});

test('Windows defaults the database under LOCALAPPDATA', () => {
  const host = { platform: 'win32', homedir: 'C:\\Users\\user' } as const;
  assert.equal(
    loadConfig({ ...credentials, LOCALAPPDATA: 'D:\\Local' }, host).databasePath,
    'D:\\Local\\navidrome-playlist-mcp\\playlists.sqlite',
  );
  assert.equal(
    loadConfig(credentials, host).databasePath,
    'C:\\Users\\user\\AppData\\Local\\navidrome-playlist-mcp\\playlists.sqlite',
  );
});
