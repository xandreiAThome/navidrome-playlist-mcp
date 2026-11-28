# Rebuild the README around `setup`

Status: done
Blocked by: 03

Quick start is the single `setup` command; keep a short manual-config section with
the environment-variable table and one example; recommendations section says to
enable AudioMuse in `setup` and ask the assistant to calibrate.

## Comments

- 2026-11-27 (maintainer): Also remove the "Moving from Docker" migration
  guidance: the README section and its reference in
  `docs/playlist-workflows.md`. Leave ADRs and closed specs as historical
  records.
- 2026-11-27 (agent): Done. README quick start is now the `setup` command, with
  a hand-configuration section (variable table, one example) and AudioMuse
  recommendations via setup. Removed "Moving from Docker" from README and its
  link in `docs/playlist-workflows.md`; ADRs and closed specs left as is. The
  flags from ticket 04 are documented in the README's "Run setup without
  prompts" section.
