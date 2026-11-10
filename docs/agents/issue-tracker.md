# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Specs live at `.scratch/<feature-slug>/spec.md`.
- Implementation issues live at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`,
  with one file per ticket.
- Record triage state as a `Status:` line near the top of each issue.
  Use the role strings in `triage-labels.md`.
- Append comments and conversation history under `## Comments`.

## Publishing issues and specs

Create the corresponding file at the path above, creating directories
as needed.

## Fetching tickets

Read the referenced issue file. If given only a number, locate its
file within the relevant feature directory; ask when ambiguous.

## Wayfinding operations

For `/wayfinder`, the map is `.scratch/<effort>/map.md`, containing
Notes, Decisions-so-far, and Fog. Each child ticket lives at
`.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`.

- Record the question in the ticket body.
- Use `Type:` for `research`, `prototype`, `grilling`, or `task`.
- Use `Status:` for `open`, `claimed`, or `resolved`.
- Record dependencies as `Blocked by: NN, NN`.
- A ticket is unblocked when every listed dependency is resolved.
- Select the lowest-numbered open, unblocked, unclaimed ticket.
- Claim it by saving `Status: claimed` before starting work.
- Resolve it by appending the answer under `## Answer`, setting
  `Status: resolved`, and adding a gist and link to Decisions-so-far
  in the map.

Wayfinding statuses describe the ticket lifecycle; triage roles
describe implementation issue readiness.
