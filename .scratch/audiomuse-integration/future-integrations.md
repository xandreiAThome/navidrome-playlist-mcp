# Future AudioMuse-AI integrations

Ideas saved for future reference. These are outside the [agreed integration spec](spec.md); documenting them does not authorize implementation or establish a delivery order.

| Idea | Example workflow | Questions to resolve before planning |
| --- | --- | --- |
| Song paths | Build a listening journey from an acoustic song to an electronic track. | Path length, intermediate-track selection, endpoint preservation, and how results enter a draft. |
| Listening-history recommendations | Make a discovery playlist based on what the user has been playing lately. | History source, time window, weighting, and treatment of previously played tracks. |
| Song Alchemy exclusions | Find songs like three supplied tracks while moving away from the sound of a fourth. | Meaning and strength of SUBTRACT influences, ranking behavior, and interaction with balanced expansion. |
| Lyrics meaning search | Find songs about moving on and starting over. | Lyrics availability, language coverage, indexing requirements, and whether lyrical relevance combines with sonic similarity. |
| Automatic clustering | Group library tracks into playlists based on their sound. | Cluster size, naming, review of multiple drafts, and handling library changes. |
| Recording identification | Identify an uploaded audio clip within the library, or find other recordings of a selected song. | MCP audio/file input, clip limits, confidence, alternate-recording identity, and ambiguous results. |
| Music-map exploration | Explore musical neighborhoods around a selected track. | Whether MCP returns nearby tracks or map data; an interactive visual map would require a UI beyond the current stdio tools. |

## Evidence and limits

These ideas map to features listed in the [AudioMuse-AI README](https://github.com/NeptuneHub/AudioMuse-AI#readme), reviewed during this planning conversation. The example workflows are proposed MCP uses, not verified tool contracts. Each idea needs API and supported-version verification, prerequisite analysis/index checks, and its own scope decisions before implementation.

Song paths and listening-history recommendations were suggested as possible next candidates. The user has not selected or prioritized either.

Any future playlist-producing integration should revisit the existing draft, preview, and publication boundary explicitly rather than assuming AudioMuse may write playlists directly.
