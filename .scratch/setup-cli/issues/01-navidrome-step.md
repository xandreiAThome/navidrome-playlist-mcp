# Add the `setup` subcommand with the Navidrome verification step

Status: ready-for-agent

Route `setup` in the CLI while keeping the default stdio server. Implement prompts,
URL normalization, verification, and re-prompting per the [spec](../spec.md), ending
by printing the manual config (client writing comes in 03).

## Comments
