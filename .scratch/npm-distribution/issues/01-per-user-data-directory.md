# Default the database to a per-user data directory

Status: resolved

Replace the working-directory default in `src/config.ts` with the per-platform
directory in the [spec](../spec.md). `NAVIDROME_DB_PATH` still overrides it. Update
README and `.env.example` wording and add the `.data` migration note.

## Comments
