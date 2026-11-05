# HECATE v2 — Roadmap

**Status:** Approved · **Owner:** repository owner · **Started:** Nov 2026

Decisions behind this roadmap are recorded as ADRs in [`docs/adr/`](../adr/).

---

## Overview

HECATE v1 is a browser-only cockpit over JSON files in a private data repo.
Since it shipped, day-to-day planning moved into Claude skills (focus drafting,
meeting processing, session logging) that read and write local markdown files.
HECATE fell out of that loop: two sources of truth, and the app became the one
that was not maintained.

v2 makes HECATE the **single source of truth** that both the owner and Claude
work against:

- one data contract (zod schemas) and one write path for the app, Claude and bots;
- a remote MCP connector so any Claude surface can read and write it;
- skills that propose changes with a dry run and write only on confirmation;
- a UI that is a calm cockpit over state the agent largely maintains.

### Why now — what v1 got wrong

| Area | Problem in v1 | Where |
|---|---|---|
| Data safety | A stale-SHA 409 re-PUT the whole local copy, silently deleting writes from MCP or the calendar bot, and skipped the future-schema guard | `apps/web-v1/src/store/useDataStore.ts` (fixed in P0) |
| Autosave | Stopped for good after a failed or overlapping save; not a real debounce | `apps/web-v1/src/hooks/useDataFile.ts` (fixed in P0) |
| Dates | UTC maths: in Australian time zones week keys and calendar columns land a day early | `apps/web-v1/src/lib/utils.ts`, `WeekCalendarView.tsx` |
| Domain logic | Lives inside pages and is re-implemented in the MCP server | `apps/web-v1/src/pages/*`, `mcp/src/tools/write.ts` |
| Structure | Structured data hidden in markdown, parsed by regex keyed on magic section ids | `apps/web-v1/src/components/focus/*` |
| Identity | Three task-ID schemes; tag-based project links; people matched by name | `apps/web-v1/src/lib/ids.ts`, `taskConstants.ts` |
| Storage | Whole-file PUTs: one commit per autosave, 1 MB Contents API ceiling, no multi-file atomicity | `apps/web-v1/src/lib/github.ts` |
| Close Sprint | Not atomic; followed by Generate Week it produced an empty Completed list | `ArchivePage.tsx`, `WeekLogPage.tsx` |
| Toolchain | Node 20 (EOL), Vite 6, Tailwind 3, ESLint 9; ~49 audit advisories | `package.json` (Node 24, pnpm and audit fixes in P1) |

---

## Architecture

```
claude.ai / Cowork / Claude Code ──MCP (OAuth bearer)──┐
Browser PWA ───────────────/api (httpOnly cookie)──────┤
GitHub push webhook (data repo) ───────────────────────┤
                                                       ▼
          Cloudflare Worker  (static assets + /api + /mcp + /oauth + /hooks)
                 │  every request → @hecate/core ops (zod-validated, pure)
                 ▼
          WorkspaceDO  (one Durable Object per workspace; the only writer)
            • authoritative state in DO SQLite, monotonic version, opId dedupe
            • read-your-writes for app + MCP; activity cursors; key index
            • alarm → coalesced git commit (≥30 s apart, flush on demand)
                 │  Git Data API, GitHub App installation token
                 ▼
          Data repo (git = durable store + audit history)
```

| Concern | Choice | ADR |
|---|---|---|
| Storage | Stay on git, restructured into smaller files with atomic multi-file commits | [0001](../adr/0001-storage-git.md) |
| Writes | One Durable Object per workspace is the only writer; commits are coalesced | [0002](../adr/0002-durable-object-single-writer.md) |
| Calendar | No calendar mirror: skills read the calendar through Claude's connector when they draft | [0006](../adr/0006-retire-calendar-sync.md) |
| Auth | GitHub App installation token for storage; GitHub login for identity only, single-user allowlist; OAuth provider for MCP | [0003](../adr/0003-github-app-auth.md) |
| Change model | Idempotent, relative ops shared by app, MCP and bots; dry run for propose-and-confirm | [0004](../adr/0004-ops-model.md) |
| Work data | Per-workspace `open` / `sanitised` policy | [0005](../adr/0005-work-data-policy.md) |

### Repository layout (pnpm workspace)

```
apps/web/              v2 React PWA
apps/web-v1/           v1, moved unchanged; deployed until cutover, then deleted
apps/worker/           Worker: assets, /api, /mcp, /oauth, /hooks, WorkspaceDO
packages/core/         zod schemas, per-file migrations, ops + apply, selectors,
                       tz-safe date-only helpers, key allocation, renderers, JSON Schema export
packages/github-store/ Git Data API adapter (replaces both v1 GitHub clients)
packages/ui/           design tokens (@theme), primitives, <Markdown> with task-key chips
plugin/                Claude plugin: manifest, .mcp.json, skills
scripts/               migrate-v1 (dry-run report), package-skills, export-schema
design/                DESIGN-STANDARD (vendored), DLS.md, foundations.md, DECISIONS.md, audit.md
docs/adr/              architecture decision records
```

**Toolchain:** pnpm 11 with a shared catalog, Node 24, TypeScript 6, Vite 8,
Vitest 5, Tailwind 4, React 19.2, zustand 5, zod 4, ESLint 10 (type-aware) with
react-hooks v7, knip, Playwright + axe, wrangler 4, Dependabot.

---

## Data model v2

Per workspace directory in the data repo. **The field-level contract is
`packages/core`**: zod schemas in `packages/core/src/schemas/`, and the JSON
Schemas generated from them in `packages/core/json-schema/` (drift-tested in
CI). This table is the overview; ADR 0007 records the rules.

| File | Contents |
|---|---|
| `workspace.json` | Name, timezone, policy (`open` / `sanitised`), working days, sprint cadence (anchor date and number, length in weeks; the start weekday is the anchor's), statuses with a category (`backlog`/`todo`/`active`/`done`/`dropped`), tag vocabulary, activity areas |
| `profile.json` | Me, preferences, productivity system, recurring responsibilities |
| `tasks.json` | `{nextKey, tasks[]}` — a flat list |
| `focus/{monday}.json` | `schedule` (one list for Week at a Glance and today's meetings, written by skills from the calendar connector; personal entries keep only their time slot), `days` (plan items, then outcomes done / carried / dropped; a closed day renders as a Done section), callouts, priorities by tier (`focus` 🎯 / `next` 🟡 / `ongoing` 🟢), last week, freeform sections. Today and Waiting On are derived, not stored |
| `focus/keep-in-mind.json` | Rolling list, not copied week to week |
| `projects/{slug}.json` | Status, phase, deadlines (hard flag), open questions (blocker flag), ordered next actions, timeline, stakeholder cutoffs, sections |
| `sprints/{n}.json` | Dates, goal, full done / dropped tasks moved here at close, carried keys, retro, velocity |
| `people.json` / `glossary.json` | People (roles only in sanitised workspaces) and terms |
| `references/*.md` | Real markdown files |
| `meetings/*.md` | Meeting summaries (open workspaces only) |
| `activity/{YYYY-Www}.jsonl` | Session log entries plus meaningful events |

**Task:** `id` (ULID), immutable `key`, `legacyIds`, `kind` (`action` /
`waiting`, fixed by the key's series), `title`, `note`, `status`, fractional
`order`, `urgency` (high / med / low), `tags`, `projectId`, `waitingOn`,
`dependsOn`, `due`, `createdAt`, `updatedAt`, `completedAt`. Keys are `A` (mine)
and `B` (waiting on someone) in every workspace, numbered from counters in
`tasks.json` and never reused (ADR 0007). "Waiting on" is derived from open B
tasks and "blocked" from open `dependsOn`, which collapses v1's In Review
column, Blocked column and `blockedSince`.

Every file has its own `schemaVersion` and migrations, and is validated by its
zod schema on load and on write. Schemas are strict: unknown keys are rejected
and every shape change bumps the version. A file from a newer build is refused,
and a file with no version is treated as a v1 file (it reaches v2 only through
`migrate-v1`). Dates are date-only strings in the workspace's time zone.

---

## MCP v2

About ten tools, with the op catalogue and JSON Schemas exposed as resources:

| Tool | Purpose |
|---|---|
| `list_workspaces` | Workspaces with policy and default |
| `get_briefing` | Sprint position, focus week, in-progress, waiting-on, deadlines, cutoffs, keep-in-mind, profile, unread activity — in one call |
| `find_tasks` | Filter by key, status, kind, tag, project, urgency |
| `get_entity` | Task (including archived), project, person, term, sprint, focus week, reference |
| `search` | Full text across all modules |
| `apply_ops` | The only write tool: `{ops[], dryRun, ifVersion}`, one commit; dry run returns a rendered preview and diff; `$1` placeholders resolve to real keys on commit |
| `render_focus` | A focus week as markdown, in the format the skills already use |
| `get_activity` / `ack_activity` | Read since a named cursor; advance it |

---

## Phases

One unstacked PR per story, squash-merged to `main`.

| Phase | Epic | Size | Depends on |
|---|---|---|---|
| P0 | v1 safety hotfixes and this roadmap | S | — |
| P1 | Foundations: monorepo, toolchain, `@hecate/core`, migration dry run | L | P0 |
| P2 | Worker: DO single writer, github-store, auth, MCP v2 on a `v2` data branch | L | P1 |
| P3 | Skills plugin and import | M | P2 |
| P4 | Minimal web v2: Board + read-only Today | M | P2 |
| — | **Cutover** — P2 + P3 + P4 ship together so there is never a second source of truth | S | P3, P4 |
| P5 | Projects, Sprint review, People & Glossary, Activity UI, editable Today | L | Cutover |
| P6 | Playwright + axe gate, live updates over DO WebSockets, offline polish | M | P5 |

### P0 — v1 safety hotfixes

- [x] 409 adopts the remote copy through the migrate/validate guard; never re-PUTs local data.
- [x] Autosave keyed on a per-edit `revision`: trailing debounce, backoff retries after failure, saves serialised per file.
- [x] `saving` split from `loading`, so a save no longer swaps the page for a skeleton.
- [x] Close Sprint saves the archive before clearing columns, and clears only previewed tasks.
- [x] Hard-coded personal names removed.
- [x] Data repo: calendar Action gets `concurrency` + rebase-retry; personal events redacted at ingestion (separate PR). The sync was then retired altogether — see [ADR 0006](../adr/0006-retire-calendar-sync.md).

**Acceptance:** a 409 never PUTs local data and a remote addition survives;
autosave resumes after a failed save and after an edit during an in-flight
save; no skeleton during saves; no personal names in `src/`.

### P1 — Foundations

Stories: move v1 to `apps/web-v1`; pnpm workspace, catalog, Node 24, CI and
Dependabot; `@hecate/core` schemas, migrations, date helpers (tests under
`TZ=Australia/Sydney` and `UTC`), key allocation; op catalogue, `apply` and
selectors with idempotency and ordering tests; `migrate-v1` with a dry-run
report; `AGENTS.md` and README rewrite.

Delivered as five sequential PRs (the original third PR was split in two to keep each reviewable):

- [x] `chore/pnpm-monorepo` — v1 moved to `apps/web-v1` (frozen, own versions);
      v1 MCP server packaged in place at `mcp/`; pnpm 11, Node 24, CI, deploy,
      Dependabot, knip; `AGENTS.md`; audit down from 49 advisories (3 critical,
      15 high) to 0 high or critical.
- [x] `feat/core-schemas` — `packages/core`: zod schemas for all eleven file
      kinds, per-kind versioning and migrations, tz-safe date-only helpers
      (tested under UTC and Australia/Sydney), A/B key allocation, ULIDs, the
      sanitised-policy check, committed JSON Schemas with a drift test; the
      shared catalog, TypeScript 6 and type-aware ESLint 10 for v2 packages.
- [x] `feat/core-ops` — the write engine: `prepareBatch` / `applyBatch`
      (atomic, deterministic, validated before success), 35 ops across tasks,
      workspace, profile, focus, keep-in-mind, projects, sprints, people,
      glossary, references, meetings and the activity log; `$n` placeholders;
      fractional ordering; atomic sprint close; cross-file `checkWorkspace`;
      automatic activity events; whole-workspace file I/O; `ops.schema.json`.
- [ ] `feat/core-views` — selectors (Waiting On, blocked, today, sprint
      position, `briefing`), the focus-week markdown renderer in the skills'
      format, and the dry-run preview renderer.
- [ ] `feat/migrate-v1` — `scripts/migrate-v1` with a dry-run report.

**Acceptance:** typecheck, lint, knip, test and build green in CI;
`migrate-v1 --dry-run` reports zero validation errors for every workspace and
accounts for every v1 field; no high or critical audit advisories.

### P2 — Worker and MCP v2

Stories: github-store (tree read with ETag, atomic multi-file commit,
non-fast-forward rebuild); WorkspaceDO (SQLite state, version, opId dedupe,
alarm coalescing, webhook refresh, key index); GitHub App and allowlist; `/api`;
`/mcp` with the OAuth provider; MCP tools plus a stdio entry for local use;
preview and production environments.

**Acceptance:** MCP Inspector lists the tools; the claude.ai connector
authenticates and `get_briefing` works on the `v2` branch; 20 ops in 60 s
produce at most 2 commits; concurrent app and MCP ops both survive; an external
push is picked up within 10 s; a non-allowlisted user gets 403.

### P3 — Skills plugin and import

Stories: port the focus, meeting and session-log skills to MCP (formats and
propose-and-confirm unchanged; vocabulary read from the workspace, nothing
personal in this repo); an import skill for the legacy markdown files;
`package-skills` for claude.ai uploads; plugin manifest; sanitised-policy
behaviour.

**Acceptance:** each skill runs end to end on preview (dry run, then confirm)
with today's output format; a sample import yields the expected counts; a
sanitised workspace rejects meeting notes and person names.

### P4 — Minimal web v2

Stories: `design/` layer and tokens; shell and PageShell; Board on ops
(dnd-kit, keys, urgency, dependencies); read-only Today; login; PWA.

**Acceptance:** drag, add, edit and complete work on preview; no token anywhere
in the browser; no Tier 0 axe violations; usable at 375 px with no hover-only
controls.

### P5 / P6

**P5:** close sprint is a single commit, revertible with `git revert`; projects
show linked tasks by `projectId`, including archived ones; the activity unread
cursor matches `ack_activity`; Today is editable, including end-of-day outcomes.

**P6:** the Playwright + axe job gates PRs; two open tabs converge within 2 s.

### Definition of done (every PR)

- CI green: typecheck, lint, knip, test, build.
- ADR updated if a decision changed; `DECISIONS.md` entry for any SHOULD deviation.
- UI changes verified in a browser, not by reading the code back.
- No names, keys or personal paths committed.
- `AGENTS.md` updated when a contract changes.

---

## Migration and cutover

- `migrate-v1` maps each workspace's seven v1 files to the v2 tree, with a
  dry-run report: counts per entity, unmapped fields, validation errors.
  Columns become `status`; task ids become keys with the old id kept in
  `legacyIds`; archive and week-log entries become legacy sprint files; memory
  splits into profile, people, glossary and references; old focus pages keep
  their sections as freeform markdown; stored calendar events are dropped
  (ADR 0006).
- **Beta:** the migration runs onto a `v2` branch of the data repo, which the
  preview Worker reads. v1 keeps working on `main`.
- **Cutover:** tag `v1-final` in both repos; re-run the migration and the import
  from the latest data onto `main`; delete the disabled calendar workflow and its
  scripts from the data repo (ADR 0006); point the Pages site at the new URL;
  delete `apps/web-v1` and `mcp/`; archive the legacy markdown files.

## Costs and risks

| Item | Note |
|---|---|
| Cloudflare Workers Paid | ~US$5/month for CPU headroom and Durable Objects; GitHub stays free |
| MCP SDK v2 on Workers | Spike first in P2; fall back to Cloudflare's `agents` McpAgent |
| Sanitised policy is heuristic | Name detection only warns; the guarantee is that skills write roles |
| Two systems during beta | v1 and v2 use separate data branches; no real-use writes to `v2` before cutover |
