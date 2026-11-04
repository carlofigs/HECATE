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
| `packages/*` | v2 shared packages (`@hecate/core`, …) | From P1 |
| `apps/*` (other) | v2 web app and Worker | From P2 |
| `docs/` | Roadmap and ADRs | Living |
| `branding/` | Source brand assets (SVG/PNG) | Stable |

- pnpm `11.1.2` workspace (`packageManager`), Node 24 (`.nvmrc`). Run
  `corepack enable` once and pnpm follows the pinned version.
- **v1 is frozen.** `apps/web-v1` and `mcp` pin their own versions (Vite 6,
  Tailwind 3, ESLint 9, TypeScript 5.9) and are deleted at cutover. They take
  security fixes and bug fixes only — no refactors, no toolchain majors.
- **v2 uses the shared catalog** in `pnpm-workspace.yaml` (React ~19.2,
  TypeScript ~6.0, Vite 8, Vitest 5, Tailwind 4, zod 4). The catalog starts
  with the first v2 package; add an entry rather than pinning a version in a
  v2 manifest.
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

## Privacy and what stays out of the tree

This repo is public. No real people's names, employer or client names,
workspace names, tokens, or personal machine paths in committed files —
including tests, fixtures, comments and PR descriptions. Fixtures use
`Alex`/`Sam`-style names and generic task titles. Work workspaces follow the
`sanitised` policy (ADR 0005): roles, never names.

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
