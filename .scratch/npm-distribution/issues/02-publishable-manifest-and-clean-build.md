# Make the package publishable with a clean build

Status: resolved

Apply the manifest changes and clean `build` from the [spec](../spec.md). Verify with
`npm pack --dry-run` that only `dist`, `drizzle`, README, LICENSE, and
`package.json` ship and that no stale `dist` files remain.

## Comments
