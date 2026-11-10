import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

// Database-first, reviewed SQL. Serialize the version check and DDL across processes.
export function migrate(database: Database.Database) {
  database
    .transaction(() => {
      database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
      const current = database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get() as { version: number | null };
      const files = ['0001_initial.sql', '0002_operation_state.sql', '0003_discovery.sql'];
      if ((current.version ?? 0) > files.length)
        throw new Error('Database schema is newer than this application.');
      for (const [index, file] of files.entries()) {
        const version = index + 1;
        if (version <= (current.version ?? 0)) continue;
        database.exec(readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8'));
        database.prepare('INSERT INTO schema_migrations VALUES (?)').run(version);
      }
    })
    .immediate();
}
