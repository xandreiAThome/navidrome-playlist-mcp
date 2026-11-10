# Optional AudioMuse discovery uses the existing publication workflow

For the planned discovery extension, the MCP connects to an optional, separately managed AudioMuse-AI service; its installation, models, and library analysis remain outside this service's ownership. Existing MCP features remain usable without AudioMuse, avoiding a mandatory analysis stack for users who only need explicit song lists.

Discovery covers listening descriptions, similar songs, and expanding a supplied song list with fitting recommendations. Recommendations enter the existing draft, preview, and publication workflow governed by ADR 0002, preserving one owner for playlist writes and recovery. This decision lifts ADR 0001's deferral of mood-based discovery for this extension; implementation is not yet authorized, and the agreed expansion policies are recorded in the feature spec.
