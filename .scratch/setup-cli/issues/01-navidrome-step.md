# Add the `setup` subcommand with the Navidrome verification step

Status: done

Route `setup` in the CLI while keeping the default stdio server. Implement prompts,
URL normalization, verification, and re-prompting per the [spec](../spec.md), ending
by printing the manual config (client writing comes in 03).

## Comments

- Done: `setup` routes to `src/setup/`; the Navidrome step normalizes the URL, verifies via
  `Navidrome.verifyConnection()`, re-prompts the failing value, and prints the manual config.
  Later steps extend `runSetup` through the injected `Prompts` interface.
