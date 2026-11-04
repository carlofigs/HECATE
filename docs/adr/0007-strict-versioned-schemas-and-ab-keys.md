# 0007 — Strict, versioned file schemas; A/B task keys everywhere

**Status:** Accepted (Nov 2026)

## Context

v2's files are read and written by several programs that are deployed
independently: the Worker, the MCP tools, the web app, the import and the
skills. At any moment one of them can be older than the file it is handed.

v1 had one global schema version, a shallow structural check, and the rule
"additive optional fields need no version bump; older builds ignore them". That
rule was wrong in practice: v1 rebuilt objects from the fields it knew, so an
older tab silently stripped any newer field the next time it saved.

Task identifiers had also drifted: one workspace used `t-a89`, another `w-05`,
another `glinda-01`, while the planning skills number work `A76` (mine) and
`B37` (waiting on someone).

## Decision

**Schemas.** `packages/core` defines every file kind as a zod schema, and the
TypeScript types are inferred from it.

- Objects are strict: an unknown key is an error, not something to drop.
- Every key is required. Unset values are `null` or `[]`, never absent.
- No defaults or transforms, so the shape read is the shape written. The
  generated JSON Schemas are identical for input and output, are committed
  under `packages/core/json-schema/`, and fail CI if they drift.
- Refinements carry the rules JSON Schema cannot express (uniqueness, key
  counters, in-week dates, private calendar rows) and are enforced by
  `parseFile`, which every reader uses.

**Versions.** Every file carries `schemaVersion`, versioned per kind.

- **Any** change to a kind's shape, including an added field, bumps its version
  and registers a migration step. A test fails if a step is missing.
- A file newer than the build is refused (`FutureSchemaError`), so it is never
  misread and never written back in an older shape.
- A file with no version is a v1 file and is refused (`UnversionedFileError`).
  v1 data reaches v2 only through `migrate-v1`, never through v2's own
  migrations.

**Task keys.** Every workspace uses two fixed series: `A` for my actions and `B`
for things I am waiting on.

- `kind` follows the series and cannot change; a waiting item that becomes my
  action is a new A task.
- Counters live in `tasks.json` (`nextKey`), only move forward, and keys are
  never reused, so a key in a meeting note or commit message always means the
  same task.
- Earlier identifiers are kept in `legacyIds` and still resolve.
- Other entities use ULIDs, so ids sort by creation time without coordination.

**Dates.** Calendar dates are `YYYY-MM-DD` strings with no time or zone. Only
"what is today" needs a zone, and it is always asked of the workspace's zone.
The core package contains no local-time `Date` methods (enforced by lint), and
its tests run under both UTC and Australia/Sydney.

## Consequences

- An older build can never corrupt a newer file; the cost is a migration step
  for every shape change, even a trivial one.
- Strict, explicit files are larger and more verbose than v1's, and diffs show
  every field. In exchange, a reader never has to guess what an absent field
  means.
- Skills, chips and search can rely on `A`/`B` keys without reading
  configuration.

## Alternatives considered

| Option | Why not |
|---|---|
| Loose objects that preserve unknown keys | Older writers that rebuild objects still drop them; typos in keys pass silently. |
| One global schema version (v1) | The first change to any file forces a no-op migration for all of them. |
| Per-workspace key series | More configuration for every surface to read, for a convention the owner already uses everywhere. |
