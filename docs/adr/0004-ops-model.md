# 0004 — All changes are idempotent, relative ops

**Status:** Accepted (Nov 2026)

## Context

In v1 the business logic (task CRUD, close sprint, generate week) lives inside
React pages, and the MCP server re-implements the parts it needs. The two drift.
Skills also need a way to show a proposed change before writing it
(propose-and-confirm), across several modules at once (tasks, people, glossary,
meeting note), with partial confirmation.

## Decision

Every change is an **op**: a plain, serialisable object defined and applied in
`@hecate/core`, shared by the web app, the MCP server and the bots.

- **Idempotent.** New entities get client-generated ULIDs; each batch carries an
  `opId` the writer deduplicates, so a retried `task.add` never creates a
  duplicate.
- **Relative.** Ordering uses `move(id, status, afterId)` and fractional `order`
  keys — never array indexes — so concurrent edits compose.
- **Validated.** `apply` runs the op, then the file's zod schema; an op that
  would produce an invalid file is rejected before it is stored.
- **One write tool.** MCP exposes `apply_ops({ops, dryRun, ifVersion})`. A dry
  run returns a rendered markdown preview and diff without writing; the skill
  shows it, and on confirmation sends the same (or a subset of the) ops. New
  task keys are written as placeholders (`$1`) and resolved at commit, so a
  proposal never reserves keys it may not use.
- Commit messages are generated from the ops, with an `Actor: app|claude|bot`
  trailer.

## Consequences

- Close sprint, roll week and similar multi-file operations become single ops
  and single commits.
- The UI holds no domain logic; it dispatches ops and renders selectors.
- The op catalogue is a public contract: changing an op's shape is a versioned
  change with a migration, like a schema change.

## Alternatives considered

| Option | Why not |
|---|---|
| Whole-file writes (v1) | Overwrites concurrent changes; no meaningful preview. |
| One MCP tool per verb with its own `dryRun` | Cannot preview or commit a multi-module batch atomically; inflates the tool list every session loads. |

## Amendment — engine rules (Nov 2026, with `feat/core-ops`)

Recorded when the engine was built in `packages/core`:

- **Canonical batches.** A writer sends `{ ops }`. `prepareBatch` fills every
  generated id, normalises tag and area names, and stamps `opId`, `at` and
  `actor`. That canonical batch is what is stored and replayed.
- **Deterministic apply.** `applyBatch(state, batch)` uses only the batch's own
  time (`today` is the workspace-local date at `at`) and seeds the ids of
  automatic activity entries from `opId`. The same state and batch always give
  the same result, which is what makes replay and dry runs trustworthy.
- **All or nothing, validated.** The first failing op aborts the batch. Before
  success, every changed file is validated against its schema and the
  workspace against cross-file checks (`checkWorkspace`).
- **Placeholders are named, not positional.** `task.add` may declare `ref:
  "$1"`; keys are allocated in batch order and substituted only in key-typed
  fields, never in prose. Sending a subset of a proposal keeps every remaining
  reference valid; a reference to a dropped op fails by name.
- **New tags and activity areas are added automatically** and reported as
  warnings, so a dry-run preview shows them before anything is written.
- **The activity log is append-only.** `applyBatch` returns the entries to
  append; nothing rewrites a weekly log file.

