# 0008 — Migrating v1 data

**Status:** Accepted (Nov 2026)

## Context

v2 can become the source of truth only once the existing data moves across.
Each v1 workspace is seven JSON files (`tasks`, `focus`, `projects`,
`weekly_log`, `archive`, `memory`, `settings`), written over months by the app,
the MCP server, scripts and hand edits. Profiling the real data (counts and
patterns only) found what the migration has to absorb:

- No column types on one board; waiting items kept in an "In Review" column.
- Task ids in several styles: `t-a12` and `t-b3`, suffixed copies (`t-a12-2`),
  generated ids (`t-a-lx3k9r`), project-style ids (`w-05`, `club-01`), and
  archived tasks with no id at all.
- The same task archived in several weeks, and archived tasks still on the board.
- `weekOf` dates that are not Mondays.
- Calendar events stored by the retired sync (ADR 0006).
- Colleagues' names throughout the prose of a workspace that is to be sanitised
  (ADR 0005), and a `role` field that held a full name.

v2's rule is that every write is an op (ADR 0004). An op allocates fresh keys and
stamps the batch time, so migrating through ops would renumber every task and
date every record to the moment of migration.

## Decision

**A one-off package, built to be deleted.** `packages/migrate-v1`
(`pnpm migrate-v1`) converts every v1 workspace in a data-repo checkout to the v2
tree. By default it is a dry run that prints a report; it writes only with
`--out`, and only if every workspace is ready. It is deleted with v1 at cutover.

**Files are built directly, then validated like any other.** This is the one
sanctioned exception to "every write is an op", and it exists to keep v1's task
numbers and timestamps.

- The migration is pure and deterministic for a given `--at`.
- Every file goes through `parseFile` / `serializeFile`.
- The finished tree is loaded with `stateFromFiles` and checked with
  `checkWorkspace`, the same code every v2 reader uses.
- Any failure is an error, and nothing is written.

**Every v1 field has a decision.** `FIELD_MAP` lists each v1 key path as one of:

- **mapped:** same meaning, same place;
- **transformed:** reshaped;
- **to-text:** rendered into markdown;
- **dropped:** with the reason.

A field in the data that the map does not know is an error, so nothing is lost
silently.

**Task keys.**

- `t-aN` and `t-bN` keep their number as `AN` and `BN`. Tasks on the board claim
  their number first, then archived ones.
- Every other task gets the next number after the highest kept one, in creation
  order. Ties go to the v1 id in natural order, so `w-01` comes before `w-05`.
  This covers suffixed, generated and project-style ids, archived tasks with no
  id, and a second board task with an id already taken.
- The series comes from a `t-a` / `t-b` prefix, otherwise A.
- The v1 id is kept in `legacyIds`, except for a repeated board id, which can
  resolve to only one task.
- References in prose that v1 rendered as task chips (`t-…`) are rewritten to
  keys. Unknown ones are left as written. Other id styles were never chips, so
  they stay as written and still resolve through `legacyIds`.

**Statuses.** Columns become statuses in board order. The category comes from
`columnType` or, when that is unset, from the column name. A required category
the board lacks (e.g. "Not Doing") is added.

**Archive and week log become legacy sprints** (`legacy: true`).

- Each week is placed by its Monday.
- With a sprint cadence, a week joins the sprint that contains it. Without one,
  each week is its own sprint, numbered back from -1 in date order.
- Archived tasks become full v2 tasks in `done` / `dropped`, timed by
  `archivedAt`. Of repeated archive copies, the earliest is kept. An archived
  copy of a task still on the board is dropped.
- Week-log lists and narrative become markdown sections.

**Focus.** A v1 focus page becomes `focus/{monday}.json`:

- its sections stay freeform; structured weeks start with the next skill draft
  (ADR 0007);
- the sprint label becomes a section;
- stored calendar events are dropped (ADR 0006).

Until the next draft, such a week renders v1's own Waiting On and Keep in Mind
sections after the derived ones.

**Sanitising.** In a sanitised workspace:

- people keep only their role;
- every mention of a known name, alias, or unshared first name in migrated text
  (including file names and tags) becomes `[role]`;
- a role that contains a name is stored as "Colleague";
- 1:1 notes about someone memory never listed lose the name.

The migration config can add names memory never recorded. Core's
`findPossibleNames` counts what may remain as warnings, and `--names` lists them
locally so a person can review them before the run that writes.

**Settings live outside the repository.** v1 never stored a workspace's name, time
zone, policy, working days or sprint cadence. These, and any extra
name → role replacements, describe real workspaces. They come from a JSON file
passed with `--config` and kept outside this public repository. Without one,
a workspace is open, in UTC, Monday to Friday, with no sprints.

## Consequences

- Keys people already use survive (`t-a89` is A89), and old ids still resolve.
- A migrated workspace's history is in legacy sprint sections and pre-v2
  timestamps, not in activity events. One `import` entry marks the migration.
- Archived tasks are timed by their archive, because v1 kept no creation or
  completion time for them.
- Sanitising replaces known names only. Prose can still mention someone v1 memory
  never recorded; the dry run surfaces candidates, but deciding is a human step.
- Workspaces whose tasks also live in a skill's markdown files get their keys
  from v1 ids, which may differ from the markdown's numbering. The legacy
  markdown import (P3) has to reconcile the two.

## Alternatives considered

| Option | Why not |
|---|---|
| Migrate through ops | Renumbers every task and stamps every record with the migration time, or needs import-only escape hatches in the op set that any writer could then misuse. |
| Renumber every workspace from A1 | Breaks references to `t-a89` / A89 in notes, meetings and commit messages. |
| A separate file kind for v1 archive weeks | A second shape for history that every reader must learn; legacy sprints reuse the sprint schema. |
| Redact everything the name heuristic flags | Most hits are project names and capitalised phrases; automatic redaction would damage the text. Known names plus review is safer. |
