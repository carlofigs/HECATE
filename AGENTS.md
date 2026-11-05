# AGENTS.md

Working notes for anyone, human or agent, changing this repo. The README says
what HECATE is; this says how to change it without losing anyone's data.

## What this is

HECATE is a single-user planning system: focus, tasks, projects, sprint
reviews, people and an activity log, stored as JSON in a **separate private
data repo**. This repo is the code, and it is **public**.

It is mid-rebuild. v1 (a browser-only app plus a local stdio MCP server) is
frozen and still live; v2 is being built alongside it. Read
[`docs/v2/ROADMAP.md`](docs/v2/ROADMAP.md) for the plan and phases, and
[`docs/adr/`](docs/adr/) for why things are the way they are.

## Layout and toolchain

| Path | What | Status |
|---|---|---|
| `apps/web-v1/` | v1 React app, deployed to GitHub Pages under `/HECATE/` | Frozen — fixes only |
| `mcp/` | v1 stdio MCP server (`@hecate/mcp-v1`) | Frozen — fixes only |
| `packages/core/` | v2 data contract (`@hecate/core`): file schemas, versioning, dates, keys | Active |
| `packages/migrate-v1/` | One-off v1 → v2 conversion with a dry-run report (`@hecate/migrate-v1`) | Until cutover, then deleted |
| `packages/github-store/` | v2 storage (`@hecate/github-store`): Git Data API, App tokens, webhook signatures | Active |
| `packages/*` (other) | further v2 shared packages | From P1 |
| `apps/worker/` | v2 Cloudflare Worker (`@hecate/worker`): `WorkspaceDO`, later `/api`, `/mcp`, `/hooks` | Active |
| `apps/*` (other) | v2 web app | From P4 |
| `docs/` | Roadmap and ADRs | Living |
| `branding/` | Source brand assets (SVG/PNG) | Stable |

- pnpm `11.1.2` workspace (`packageManager`), Node 24 (`.nvmrc`). Run
  `corepack enable` once and pnpm follows the pinned version.
- **v1 is frozen.** `apps/web-v1` and `mcp` pin their own versions (Vite 6,
  Tailwind 3, ESLint 9, TypeScript 5.9) and are deleted at cutover. They take
  security fixes and bug fixes only — no refactors, no toolchain majors.
- **v2 uses the shared catalog** in `pnpm-workspace.yaml` (TypeScript ~6.0,
  Vitest 5 and zod 4 today; React ~19.2, Vite 8 and Tailwind 4 as packages
  need them). Add an entry when a manifest first uses it, rather than pinning a
  version in a v2 manifest; knip fails on entries nothing uses.
- **v2 packages** extend `tsconfig.base.json` (TypeScript 6, strict,
  `noUncheckedIndexedAccess`, no `baseUrl`) and lint with the root
  `eslint.config.js` (ESLint 10, type-aware). They are consumed as TypeScript
  source through `exports` (`"." → ./src/index.ts`); there is no build step.
- `mcp/` stays at that path on purpose: local MCP registrations point at
  `<repo>/mcp/src/index.ts`. It imports v1's schema, migrate and validate
  modules from `apps/web-v1/src/lib/` by relative path, so the two never drift.

## Commands

```bash
pnpm install                                              # once; frozen lockfile in CI
pnpm typecheck && pnpm lint && pnpm knip && pnpm test     # what CI runs, minus build
pnpm build                                                # every package that builds
pnpm dev                                                  # v1 app at http://localhost:5173/HECATE/
pnpm --filter web-v1 preview                              # serve the built v1 app
pnpm mcp                                                  # v1 MCP server over stdio (needs HECATE_* env)
pnpm export-schema                                        # regenerate packages/core/json-schema after a schema change
pnpm migrate-v1 --data <checkout> --config <file>         # v1 → v2 dry run of a data-repo checkout; add --out <dir> to write
pnpm --filter @hecate/worker build                        # bundle the Worker (wrangler --dry-run; no Cloudflare account needed)
```

CI (`.github/workflows/ci.yml`) gates pull requests; `deploy.yml` runs the same
gates on `main` and then publishes `apps/web-v1/dist` to Pages. knip must stay
clean; the frozen v1 packages are excluded in `knip.json`.

Verify UI changes in a browser, not by reading the code back. The app talks to
`api.github.com` directly, so a browser check mocks that host (Playwright
`page.route`) and seeds `localStorage` credentials — never point a check at
the real data repo.

## How work lands

- One PR at a time, branched from freshly fetched `main`, squash-merged by the
  owner before the next starts. Never stack PRs.
- Branch names are `type/kebab-description` (`feat/…`, `fix/…`, `chore/…`,
  `docs/…`). Commit messages explain why, not what the diff shows.
- `main` is production: every merge deploys v1 to Pages.
- A decision that changes the data contract, the write path or auth gets an
  ADR in `docs/adr/` (next number, never renumbered) in the same PR.

## Data safety

Several writers share the data repo: the v1 app, the v1 MCP server, and Claude
sessions pushing by hand. Treat every write as concurrent with someone else's.

- Never overwrite a newer remote copy. In v1, a stale-SHA 409 loads the remote
  copy and reports a conflict (`apps/web-v1/src/store/useDataStore.ts`); the
  MCP server re-reads and re-applies its change (`mcp/src/storage/github.ts`).
- Every read goes through migrate-then-validate. A file written by a newer
  build is refused, not misread (`apps/web-v1/src/lib/migrate.ts`).
- In v2, all writes go through one Durable Object per workspace (ADR 0002) as
  idempotent ops (ADR 0004).

## The v2 data contract (`packages/core`)

- Every file kind has a strict zod schema; read with `parseFile`, write with
  `serializeFile`. Never hand-build a file or bypass validation.
- **Any** change to a kind's shape bumps its version in `src/kinds.ts` and
  registers a migration in `src/versioning.ts` (ADR 0007). The completeness
  test fails until you do.
- After a schema change run `pnpm export-schema` and commit
  `packages/core/json-schema/`; CI fails on drift.
- Dates are `YYYY-MM-DD` strings. Use `dates.ts`; local-time `Date` methods are
  banned in core by lint, and core's tests run under both UTC and
  Australia/Sydney.
- Task keys are `A` (mine) and `B` (waiting), allocated with `allocateKey` from
  the counters in `tasks.json`, never invented or reused.
- **Every write is an op.** Build `{ ops }`, run it through `prepareBatch`, then
  `applyBatch(state, batch)`; commit `changedFiles(result.state, result.changed)`,
  delete `result.deleted`, and append `result.activity` to the weekly log. Never
  edit a state or file directly: the engine is what keeps keys, order,
  `completedAt`, references and policy consistent (ADR 0004). The one
  exception is `migrate-v1`, which builds files directly to keep v1's task
  numbers and timestamps, and validates them with the same loader and checks
  (ADR 0008).
- **Storage is `@hecate/github-store`.** It runs in the Worker, so like core it
  uses fetch and WebCrypto only (no `node:*`, enforced by lint). Writes are one
  commit per change set and never force the ref: a non-fast-forward comes back
  as a result for the caller to rebuild or replay (ADR 0002). Tests use the
  in-memory fake from `@hecate/github-store/testing`, never the real data repo.
- **The Worker's logic is `apps/worker/src/engine.ts`,** not the Durable Object
  class: storage, the alarm and GitHub are injected, so it is tested in Node.
  `test/worker.test.ts` runs the bundled Worker in workerd through Miniflare
  for what only the runtime can show (storage, alarms). Keep the DO class a
  thin adapter. Its compatibility date stays within what the pinned Miniflare
  supports.
- **Read through the views.** Waiting On, blocked, today, sprint position and
  the briefing come from `src/views/selectors.ts`, and markdown from
  `src/views/render.ts`. Don't recompute them elsewhere, or the app and Claude
  will disagree. Rendered output is pinned by golden files in
  `src/__fixtures__/rendered/`; review their diff when you change a renderer.
- Adding an op: schema and handler in `src/ops/<area>.ts`, registered in
  `src/ops/index.ts` (both maps), tests in `ops.test.ts`, then
  `pnpm export-schema` for `json-schema/ops.schema.json`.

## Privacy and what stays out of the tree

This repo is public. No real people's names, employer or client names,
workspace names, tokens, or personal machine paths in committed files —
including tests, fixtures, comments and PR descriptions. Fixtures use
`Alex`/`Sam`-style names and generic task titles. Work workspaces follow the
`sanitised` policy (ADR 0005): roles, never names.

The `migrate-v1` config (workspace names, time zones, sprint cadences and
name → role replacements) describes real workspaces: keep it outside this repo
and pass it with `--config`. The dry-run report names each workspace directory
but carries counts, not content; `--names` prints possible leftover names to
the terminal only.

Git history is shared with everyone who can read the repo, so removing a
secret is not enough — rotate it too.

## Design

v2 UI follows the owner's `DESIGN-STANDARD.md` (v1.4), with HECATE's own layer
in `design/` (added in P4): read `DLS.md`, `foundations.md` and
`DECISIONS.md` before UI work, build from tokens only, implement every state,
and record SHOULD deviations in `DECISIONS.md`. Never self-approve a MUST
exception — draft the record and stop for the owner.

## Do not touch without a reason

- `apps/web-v1/` and `mcp/` beyond fixes (frozen; see above).
- Numbered ADRs: supersede with a new one instead of rewriting history.
- `apps/web-v1/public/` icons: regenerate with
  `pnpm --filter web-v1 generate-pwa-assets` from `public/icon.svg`.
