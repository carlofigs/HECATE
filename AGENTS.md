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
| `packages/ui/` | v2 design tokens and primitives (`@hecate/ui`): the Tailwind v4 `@theme` source, base styles, token checks, and the shared React components | Active |
| `packages/*` (other) | further v2 shared packages | From P1 |
| `apps/worker/` | v2 Cloudflare Worker (`@hecate/worker`): `WorkspaceDO`, `/api`, `/mcp`, `/auth`, `/hooks`, the web app as static assets, and the e2e suite (`e2e/`) | Active |
| `apps/web/` | v2 web app (`@hecate/web`): React 19, Vite 8, served by the Worker | Active |
| `plugin/` | v2 Claude skills (`hecate-*`) as a Claude Code plugin, and zips for claude.ai | Active |
| `design/` | The owner's design standard (vendored) and HECATE's design language: `DLS.md`, `foundations.md`, `DECISIONS.md`, generated `tokens/tokens.json` | Living |
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
pnpm --filter @hecate/worker smoke <url>                  # anonymous, read-only checks of a deployed Worker
pnpm package-skills                                       # plugin/dist/<skill>.zip for claude.ai uploads
pnpm --filter @hecate/web build && pnpm --filter @hecate/worker harness   # the v2 app on http://localhost:8788, fake GitHub, no accounts needed
pnpm --filter @hecate/worker e2e                          # build the app, then Playwright + axe against the harness
pnpm --filter @hecate/web icons                           # regenerate the PWA icons from public/hecate-favicon.svg (commit public/)
pnpm tokens                                               # regenerate design/tokens/tokens.json after editing packages/ui/src/theme.css
python design/rules.py --tier T0                          # the design standard's blocking rules (also --topic, --id, --profile)
```

CI (`.github/workflows/ci.yml`) gates pull requests; `deploy.yml` runs the same
gates on `main` and then publishes `apps/web-v1/dist` to Pages; `worker.yml`
deploys the v2 Worker to its preview environment (production by hand; see
[`docs/v2/DEPLOY.md`](docs/v2/DEPLOY.md)). knip must stay
clean; the frozen v1 packages are excluded in `knip.json`.

Verify UI changes in a browser, not by reading the code back.

- **v2:** check the app on the harness (`apps/worker/e2e/harness.ts`): the
  real Worker in workerd, the built app as its assets, the fake GitHub seeded
  from `e2e/fixture.ts`, and the real sign-in flow with only GitHub's consent
  page stubbed. Add what you changed to the e2e suite, which CI runs on every
  PR. Set `PLAYWRIGHT_CHROMIUM_PATH` to use a preinstalled browser.
- **v1:** the app talks to `api.github.com` directly, so a browser check mocks
  that host (Playwright `page.route`) and seeds `localStorage` credentials.
- **Both:** never point a check at the real data repo.

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
- **The Worker's routes** (`apps/worker/src/index.ts`): `/mcp` (OAuth bearer
  only), `/authorize` and `/oauth/github/callback` (connecting an MCP client),
  `/auth/*` and `/api/*` (the web app: a signed `__Host-` session cookie, with
  an Origin check on writes), `/hooks/github` (signed), `/health`. Never accept
  the cookie on `/mcp` or a bearer token on `/api`. Never loosen the allowlist,
  the Origin check or the redirect-host allowlist without an ADR (ADR 0003).
  Settings are vars (`PUBLIC_URL`, `GITHUB_CLIENT_ID`, `ALLOWED_GITHUB_USER_ID`,
  `MCP_REDIRECT_HOSTS`, `DEFAULT_WORKSPACE`) and secrets (`GITHUB_CLIENT_SECRET`, `AUTH_SECRET`,
  `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY`); none is ever committed.
- **MCP tools** live in `apps/worker/src/mcp/server.ts`. Reads go to the
  workspace's Durable Object (`read(query)` in `src/queries.ts`), which answers
  from memory through core's views and renderers; `apply_ops` is the only
  write, as actor `claude`. Tool output is markdown for the model plus the
  same facts as `structuredContent`. Adding a tool: register it there, answer
  it through core views, and cover it in `test/mcp.test.ts`.
- **Skills** (`plugin/skills/`) are public prompts. They read through the MCP
  tools and write only through `apply_ops` (dry run, show, confirm). Every
  personal fact (tags, areas, people, sprint cadence, who the user is) comes
  from the workspace at run time, never from the skill text.
  `plugin/test/skills.test.ts` fails if a skill names a tool or op that does
  not exist.
- **The web app** (`apps/web`) runs on the Worker's origin.
  - **Session:** an httpOnly cookie it never sees. Nothing credential-like goes
    in JavaScript storage (`localStorage` holds UI preferences only), and
    `e2e/no-token.spec.ts` checks it.
  - **Reads:** one snapshot of the workspace (`GET /api/workspaces/:dir`),
    with every view computed from it through core's selectors, as the MCP
    tools do.
  - **Writes:** only ops, through the store's `apply` (`apps/web/src/store.ts`):
    - it applies them locally with core's engine at once, then queues them;
    - the Worker gets one batch at a time with its own `opId`;
    - the local result stands when the Worker answers with the next version; any other answer means a refetch;
    - a refusal is dropped and explained; offline batches retry.
    - A `task.add` carries a client ULID, so the Worker keeps the same task.
    - Never write state any other way.
  - **Moves** are `task.move` with `after` = the new predecessor (`apps/web/src/board/moves.ts`, unit-tested). Drag and drop, the Move menu and Undo all reduce to it.
  - **Offline and install:** a PWA (`vite-plugin-pwa`, `apps/web/vite.config.ts`).
    - Its service worker precaches the shell and answers navigations only
      for the app's routes (`apps/web/src/pwa-routes.ts`; a new top-level
      route goes there). It never answers a Worker path, and never caches
      `/api`. `pwa-routes.test.ts` checks it against `run_worker_first`.
    - It is registered at start-up (`shell/updates.ts`); a new version is
      offered, never forced.
    - Icons: `pnpm --filter @hecate/web icons`, then commit `public/`.
    - The manifest and `theme-color` colours are read from `tokens.json`.
  - **Routing:** every path the Worker answers is listed in
    `wrangler.jsonc` `assets.run_worker_first`. A new Worker route that is
    missing from that list is served the app's `index.html` instead.
    `test/assets.test.ts` reads the list.
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

v2 UI follows the owner's `DESIGN-STANDARD.md` (v1.4, vendored in `design/`),
with HECATE's own layer beside it. Before UI work read `design/DLS.md`,
`foundations.md` and `DECISIONS.md`, and the Tier 0 register
(`python design/rules.py --tier T0`).

- **Tokens only.** `packages/ui/src/theme.css` is the source (T-08 option B).
  Its `@theme` resets Tailwind's defaults, so only HECATE's semantic tokens
  make utilities (`bg-bg-surface`, `p-inset-md`, `text-body-md`,
  `rounded-control`). Scales without a utility are read as
  `min-h-(--size-control-default)`, `z-(--z-modal)` and similar. Never write
  arbitrary values, raw colours, `z-10`/`duration-200`-style numbers or `dark:`
  in components: `packages/ui/test/literals.test.ts` fails on them.
- **Changing a token** means editing `theme.css`, running `pnpm tokens` and
  committing `design/tokens/tokens.json` (CI fails on drift). A new name
  segment goes in `packages/ui/scripts/vocabulary.ts` and the vocabulary table
  in `foundations.md` first. Contrast in both themes is a test: a colour change
  that fails it does not merge.
- **Every component** gets a spec in `design/components/` with its code
  (Appendix B), implements every §6.2 state, and every data view has empty,
  loading, error and partial states.
- **Touch-first is adaptive.** Size controls from `size.control.default` and
  `size.target.default`, which become 48/44 px on coarse pointers and narrow
  screens. Never add pointer logic to a component.
- Record SHOULD deviations in `DECISIONS.md` as they happen. Never
  self-approve a MUST exception: draft the record and stop for the owner.

## Do not touch without a reason

- `apps/web-v1/` and `mcp/` beyond fixes (frozen; see above).
- Numbered ADRs: supersede with a new one instead of rewriting history.
- `design/DESIGN-STANDARD.md` and `design/rules.*`, `design/build_rules.py`:
  vendored from the owner's upstream kit. Edits go upstream first.
- `apps/web-v1/public/` icons: regenerate with
  `pnpm --filter web-v1 generate-pwa-assets` from `public/icon.svg`.
