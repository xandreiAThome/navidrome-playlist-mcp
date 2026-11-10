# External agents drive a local playlist service

The first version serves one user and one Navidrome account through a locally launched MCP stdio command. External agents interpret conversations and send structured song requests; the service owns library matching, draft revisions, and playlist writes, while Navidrome credentials remain in process configuration and are excluded from tool arguments, results, and logs.

This boundary supports different local agents without embedding an AI runtime or chat interface. Network transports, browser UI, multi-user access, mood-based discovery, and modifications to existing playlists are deferred; publication creates new playlists only.

Publishing is allowed without human confirmation by default. An optional confirmation policy trusts the agent's assertion that the user approved the exact preview revision; it is not an independently authenticated human approval channel.

The initial implementation uses TypeScript, Node.js, pnpm, the official MCP server SDK, and local SQLite through Node's built-in API. The built-in SQLite API's release-candidate status is accepted, and storage is isolated behind a small module.
