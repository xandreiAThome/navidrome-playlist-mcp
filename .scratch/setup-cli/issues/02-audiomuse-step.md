# Add the optional AudioMuse step to `setup`

Status: done
Blocked by: 01

Implement the opt-in AudioMuse prompts, release check, and server matching from the
[spec](../spec.md).

## Comments

- Done: `src/setup/audiomuse.ts` asks to opt in, verifies the token and supported release,
  and selects the `/api/servers` entry matching `NAVIDROME_URL` by the runtime rule (asks
  when several match; explains and offers skip or recheck when none do). An unsupported
  release offers a skip. The fake AudioMuse moved to `tests/support/audiomuse.ts`.
