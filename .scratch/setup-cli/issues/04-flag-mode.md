# Support non-interactive `setup` flags

Status: done
Blocked by: 02, 03

Add the flags from the [spec](../spec.md), reading secrets only from hidden prompts
or environment variables.

## Comments

- Done. `--url`, `--username`, `--client` (repeatable; allowlisted ids or
  `manual`), `--audiomuse-url` answer their questions; secrets come only from
  `NAVIDROME_PASSWORD` / `AUDIOMUSE_API_TOKEN` or hidden prompts. Without
  `--yes`, a flag value that fails verification is asked again. `--yes` requires
  every value up front (exit 2 naming what is missing), declines AudioMuse unless
  `--audiomuse-url` is given, overwrites existing entries after showing the masked
  diff, and fails (exit 1, nothing written) on any question flags cannot answer:
  a failed verification, an unsupported AudioMuse release, or several matching
  AudioMuse servers. Unknown options are named but their values never echoed.
