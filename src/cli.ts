#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { createMcpServer } from './mcp/server.ts';

try {
  const service = createApp(loadConfig());
  const server = createMcpServer(service);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      service.close();
    }
  };
  server.server.onclose = close;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      close();
      process.exit(0);
    });
  }
  await server.connect(new StdioServerTransport());
} catch {
  // Never print raw startup errors: URLs, passwords, and local paths may occur.
  process.stderr.write(
    'Unable to start navidrome-mcp. Check local configuration and database access; see README.md.\n',
  );
  process.exitCode = 1;
}
