# HECATE

Personal productivity dashboard — tasks, projects, focus, and weekly logs, persisted to a private GitHub repository and deployed as a GitHub Pages SPA.

## What it is

HECATE is a single-user life operating system built as a React app. There is no backend and no database — all data lives in a private GitHub repository as JSON files, read and written via the GitHub Contents API using a Personal Access Token. Credentials are stored locally in `localStorage` and never leave the browser except in `Authorization` headers to `api.github.com`.

## Features

| Page | Purpose |
|------|---------|
| **Focus** | Weekly priorities, intentions, and key context |
| **Tasks** | Kanban board and list view with priority, IDs, and drag-and-drop reordering |
| **Projects** | Project tracker with status, timeline milestones, and linked tasks |
| **Week Log** | Rolling weekly log with 1:1 notes and a "Generate Week" helper |
| **Archive** | Completed task history |
| **Memory** | Freeform notes and reference material |

Additional capabilities: configurable auto-save debounce, background sync polling with stale-data detection, keyboard navigation shortcuts (`G F`, `G T`, `G P`, …), workspace switching, and a Settings page for credentials and preferences.

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

## Data model

All data is stored in a companion private repository (`HECATE_Data` by convention). Files are organised by workspace — each workspace is a top-level directory in that repo, and each file within it corresponds to one data slice:

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

See the `HECATE_Data` repository for full schema documentation.

## Setup

On first load the app shows a credentials form. You will need:

- A GitHub **Personal Access Token** with `repo` scope (Contents read/write on your data repo)
- The **owner** and **repository name** of your data repo (e.g. `carlofigs` / `HECATE_Data`)
- At least one top-level directory in that repo to use as a workspace

Credentials are saved to `localStorage` and used exclusively for GitHub API calls.

## Development

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173/HECATE/
npm run build      # tsc + vite build → dist/
npm run lint       # tsc --noEmit (type check only)
```

## Deployment

Deployed to GitHub Pages via the `dist/` directory committed to the `main` branch. The Vite base path is `/HECATE/`.

To deploy after a build:

```bash
git add -f dist/
git commit -m "chore: deploy"
git push origin main
```

## Architecture notes

- **No backend.** All reads and writes go directly to the GitHub Contents API from the browser.
- **Single user.** There is no auth layer, session management, or multi-user concurrency handling.
- **Workspace isolation.** Switching workspaces triggers a full page reload to flush all in-memory Zustand slices — the same pattern used by the sidebar switcher and the Settings credentials form.
- **Optimistic saves.** Data is written to GitHub on a debounced autosave. SHA tracking prevents 409 conflicts on concurrent saves from multiple tabs.
- **TypeScript strict.** All data shapes are defined in `src/lib/schemas.ts` as the single contract between the storage layer and the UI.
