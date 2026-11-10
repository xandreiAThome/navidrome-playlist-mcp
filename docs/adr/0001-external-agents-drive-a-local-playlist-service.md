# External agents drive a local playlist service

The first version serves one user and one Navidrome account through a locally launched MCP stdio command. External agents interpret conversations and send structured song requests; the service owns library matching, draft revisions, and playlist writes, while Navidrome credentials remain in process configuration and are excluded from tool arguments, results, and logs.

This boundary supports different local agents without embedding an AI runtime or chat interface. Network transports, browser UI, multi-user access, mood-based discovery, and modifications to existing playlists are deferred; publication creates new playlists only.

Publishing is allowed without human confirmation by default. An optional confirmation policy trusts the agent's assertion that the user approved the exact preview revision; it is not an independently authenticated human approval channel.

The implementation uses TypeScript, Node.js LTS, pnpm, the official MCP server SDK,
and local SQLite behind a small storage module. The initial built-in SQLite driver
was replaced in the authorized maintainability refactor with Drizzle ORM and
better-sqlite3. Typed queries improve schema maintenance at the cost of a native
dependency and platform binary compatibility. TypeScript 6 is retained because the
selected TypeScript ESLint release does not yet support TypeScript 7.

Reviewed, versioned SQL migrations preserve existing databases, with an immediate
transaction serializing startup upgrades. Publication claims and recovery retain
immediate transactions and conditional owner/lease updates; ORM convenience must
preserve those guarantees. Operational state uses explicit columns, while validated
JSON retains immutable revision snapshots and operation recovery history. The
publication policy in ADR 0002 remains authoritative.
