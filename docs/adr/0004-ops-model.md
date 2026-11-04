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
