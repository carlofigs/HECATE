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
| GitHub API | octokit |
| Markdown | react-markdown + remark-gfm |

## Architecture

- **No backend.** All reads and writes go directly to the GitHub Contents API from the browser.
- **Single user.** No auth layer, no session management, no multi-user concurrency.
- **Workspace isolation.** Switching workspaces triggers a full page reload to flush every Zustand slice.
- **Optimistic saves.** Debounced autosave writes to GitHub; SHA tracking prevents 409 conflicts when multiple tabs save concurrently.
- **TypeScript strict.** Data shapes live in [src/lib/schemas.ts](src/lib/schemas.ts) as the single contract between the storage layer and the UI.

### Project layout

```
src/
  pages/        # Route components (Focus, Tasks, Projects, …)
  components/   # Reusable UI + layout (AppShell, SyncStatus, …)
  store/        # Zustand data store + slice logic
  hooks/        # useSettings, useStaleDetector, …
  lib/          # schemas, GitHub client, constants, utils
```

### Data model

Data lives in a companion private repository (`HECATE_Data` by convention). Each top-level directory in that repo is one **workspace**; each file inside it is one data slice:

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

- **Node.js 20+** (required by Vite 6 and React 19)
- A GitHub account
- A second private repository to act as the data store containing at least one workspace directory with the seven JSON files above

## Setup

1. **Create a fine-grained Personal Access Token** at <https://github.com/settings/personal-access-tokens/new>:
   - Repository access: **Only select repositories** → your data repo
   - Permissions: `Contents: Read and write`, `Metadata: Read`
2. **Bootstrap the data repo.** Create at least one workspace directory (e.g. `default/`) and seed it with empty JSON files matching the shapes in [src/lib/schemas.ts](src/lib/schemas.ts).
3. **Launch HECATE** and complete the credentials form on first load with:
   - The PAT from step 1
   - Owner and repository name of the data repo
   - The workspace directory name

Credentials are saved to `localStorage` and used exclusively for `api.github.com` requests.

## Development

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173/HECATE/
npm run build      # tsc + vite build → dist/
npm run lint       # tsc --noEmit (type-check only — not a real linter)
npm run preview    # Serve the built dist/ locally
```

## Deployment

Deployed to GitHub Pages via the `dist/` directory committed to `main`. The Vite base path is `/HECATE/`.

```bash
npm run build
git add -f dist/
git commit -m "chore: deploy"
git push origin main
```

Always rebuild before committing — never edit `dist/` by hand. Consider migrating to a GitHub Actions Pages workflow to avoid committing build output.

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
- **Multi-tab safety is best-effort.** SHA tracking prevents conflicts on save, but stale-data detection requires a manual reload prompt.
- **Workspace switching reloads the page.** This is intentional, to flush all in-memory state cleanly.
- **No mobile-first optimisation.** Layout is responsive, but the primary target is desktop.
