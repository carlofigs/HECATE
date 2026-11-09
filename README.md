<div align="center">

# HECATE

**Holistic Execution Control for Analytics Tracking and Evaluation**

*A single-user life operating system — tasks, projects, focus, and weekly logs — persisted to a private GitHub repository and deployed as a GitHub Pages SPA.*

[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript_strict-20232A?style=flat-square&logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite_6-20232A?style=flat-square&logo=vite&logoColor=646CFF)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind_v3-20232A?style=flat-square&logo=tailwindcss&logoColor=38BDF8)](https://tailwindcss.com)
[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-20232A?style=flat-square&logo=github&logoColor=white)](https://pages.github.com)

</div>

> **v2 is in progress.** See the [v2 roadmap](docs/v2/ROADMAP.md) and the [architecture decision records](docs/adr/). This README describes v1.

---

## Why HECATE

I wanted a personal productivity dashboard that I fully owned, with no SaaS account, no vendor lock-in, and no server to maintain. HECATE treats a private GitHub repo as the database: every change is a commit, the full history is `git log`, and a backup is `git clone`. The trade-off is that it is **single-user, single-tab-friendly, browser-only** — and that's exactly the point.

## Features

| Page | Purpose |
|------|---------|
| **Focus** | Weekly priorities, intentions, and key context |
| **Tasks** | Kanban board and list view with priority, IDs, and drag-and-drop reordering |
| **Projects** | Project tracker with status, timeline milestones, and linked tasks |
| **Week Log** | Rolling weekly log with 1:1 notes and a "Generate Week" helper |
| **Archive** | Completed task history |
| **Memory** | Freeform notes and reference material |

Plus: configurable autosave debounce, background sync polling with stale-data detection, keyboard shortcuts, multi-workspace switching, and a Settings page for credentials and preferences.

## Tech stack

| Layer | Library |
|-------|---------|
| UI framework | React 19 |
| Language | TypeScript (strict) |
| Build | Vite 6 |
| Styling | Tailwind CSS v3 + shadcn/ui |
| State | Zustand 5 + immer |
| Routing | React Router v7 |
| Toasts | Sonner |
| Drag and drop | dnd-kit |
| GitHub API | raw `fetch` (GitHub Contents API) |
| Markdown | react-markdown + remark-gfm |

## Architecture

- **No backend.** All reads and writes go directly to the GitHub Contents API from the browser.
- **Single user.** No auth layer, no session management, no multi-user concurrency.
- **Workspace isolation.** Switching workspaces triggers a full page reload to flush every Zustand slice.
- **Optimistic saves.** Edits apply in-store immediately; autosave writes to GitHub a few seconds after the last edit, one save per file at a time. If the file changed elsewhere (Claude via MCP, the calendar sync, another tab), GitHub rejects the stale write with a 409 and the app loads the newer copy instead of overwriting it, and says so.
- **TypeScript strict.** Data shapes live in [apps/web-v1/src/lib/schemas.ts](apps/web-v1/src/lib/schemas.ts) as the single contract between the storage layer and the UI.

### Project layout

A pnpm workspace. See [AGENTS.md](AGENTS.md) for how to work in it.

```
apps/web-v1/      # v1 app (this README) — frozen until the v2 cutover
  src/
    pages/        # Route components (Focus, Tasks, Projects, …)
    components/   # Reusable UI + layout (AppShell, SyncStatus, …)
    store/        # Zustand data store + slice logic
    hooks/        # useSettings, useStaleDetector, …
    lib/          # schemas, GitHub client, constants, utils
mcp/              # v1 MCP server over stdio — see mcp/README.md
packages/         # v2 shared packages (from v2 phase P1)
design/           # v2 design standard (vendored) and HECATE's design language
docs/             # v2 roadmap and architecture decision records
branding/         # source brand assets
```

### Data model

Data lives in a companion private repository (the data repo). Each top-level directory in that repo is one **workspace**; each file inside it is one data slice:

```
{workspace}/
  tasks.json
  focus.json
  projects.json
  weekly_log.json
  archive.json
  memory.json
  settings.json
```

## Prerequisites

- **Node.js 24** (see `.nvmrc`) and **pnpm 11** — run `corepack enable` once and the pinned pnpm version is used automatically
- A GitHub account
- A second private repository to act as the data store containing at least one workspace directory with the seven JSON files above

## Setup

1. **Create a fine-grained Personal Access Token** at <https://github.com/settings/personal-access-tokens/new>:
   - Repository access: **Only select repositories** → your data repo
   - Permissions: `Contents: Read and write`, `Metadata: Read`
2. **Bootstrap the data repo.** Create at least one workspace directory (e.g. `default/`) and seed it with empty JSON files matching the shapes in [apps/web-v1/src/lib/schemas.ts](apps/web-v1/src/lib/schemas.ts).
3. **Launch HECATE** and complete the credentials form on first load with:
   - The PAT from step 1
   - Owner and repository name of the data repo
   - The workspace directory name

Credentials are saved to `localStorage` and used exclusively for `api.github.com` requests.

## Development

```bash
pnpm install
pnpm dev                      # v1 dev server at http://localhost:5173/HECATE/
pnpm typecheck                # tsc across every package
pnpm lint                     # ESLint across every package
pnpm knip                     # unused files, exports and dependencies
pnpm test                     # Vitest across every package (app + MCP server)
pnpm build                    # tsc + vite build → apps/web-v1/dist/
pnpm --filter web-v1 preview  # serve the built app locally
```

## Deployment

Deployed to GitHub Pages by a GitHub Actions workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) that runs the same checks as CI, builds, and publishes `apps/web-v1/dist/` on every push to `main`. The Vite base path is `/HECATE/`. Build output is **not** committed — `dist/` is gitignored and produced fresh on CI.

```bash
git push origin main   # → Actions builds and deploys automatically
```

One-time setup: repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Keyboard shortcuts

Press <kbd>?</kbd> in-app to see the live overlay.

| Keys | Action |
|------|--------|
| <kbd>G</kbd> <kbd>F</kbd> | Go to Focus |
| <kbd>G</kbd> <kbd>T</kbd> | Go to Tasks |
| <kbd>G</kbd> <kbd>P</kbd> | Go to Projects |
| <kbd>G</kbd> <kbd>W</kbd> | Go to Week Log |
| <kbd>G</kbd> <kbd>A</kbd> | Go to Archive |
| <kbd>G</kbd> <kbd>M</kbd> | Go to Memory |
| <kbd>N</kbd> | New task (in first active column) |
| <kbd>⌘</kbd> <kbd>S</kbd> / <kbd>Ctrl</kbd> <kbd>S</kbd> | Save all dirty files immediately |
| <kbd>?</kbd> | Toggle shortcuts overlay |

## Security

HECATE stores your GitHub PAT in `localStorage`. Anyone with access to your browser profile can read it.

- Use a **fine-grained** PAT scoped to the data repo only — never a classic token with broad `repo` scope.
- Rotate the token if your machine is lost or compromised.
- The token is sent only in `Authorization` headers to `api.github.com`; it is never transmitted anywhere else.

## Backup & recovery

Because the data repo is just a git repository, `git clone` is a complete backup. Roll back to any prior state with `git revert` or `git reset` on the data repo — the app will pick up the new file contents on next load.

## Limitations & non-goals

- **Single user, single browser profile.** No login, no sharing, no collaboration.
- **Multi-writer safety is conservative.** A save that conflicts with a newer remote copy keeps the remote copy and discards the conflicting local edit, with a warning. Stale-data detection still requires a manual reload prompt.
- **Workspace switching reloads the page.** This is intentional, to flush all in-memory state cleanly.
- **No mobile-first optimisation.** Layout is responsive, but the primary target is desktop.
