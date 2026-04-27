# HECATE — Final Code Review Prompt for Claude Opus

## Your task

You are doing a final production-readiness review of **HECATE**, a personal productivity dashboard built in React 19 + TypeScript + Vite. The codebase is fully functional and has been through 7 phases of development. Your job is to read the source files, identify any remaining issues, and produce a structured report with prioritised findings.

This is a single-user desktop app deployed as a GitHub Pages SPA. It reads/writes JSON files to a private GitHub repo via the Contents API.

---

## Tech stack

- React 19, TypeScript (strict mode), Vite 6
- Zustand + immer for state (`useDataStore`)
- Tailwind CSS v3, shadcn/ui
- `@dnd-kit` for drag-and-drop
- `react-markdown` + `remark-gfm` for markdown rendering
- `sonner` for toasts
- `react-router-dom` v6 (HashRouter)
- No backend — all persistence via GitHub Contents API

---

## Architecture summary

**Data layer:** All JSON files are loaded into Zustand slices (`FileSlice<T>`) via `useDataStore`. The `useDataFile(name)` hook provides per-page access with auto-save (debounced, configurable). `useSettings` is a specialised hook that seeds defaults and syncs theme to the DOM.

**State pattern:** Mutations use immer-style `setData(draft => { ... })`. Auto-save triggers on `slice.dirty`. Manual save bypasses debounce.

**GitHub plumbing:** `getFile` / `putFile` in `src/lib/github.ts`. SHA-based optimistic writes — PUT requires the current SHA to detect conflicts.

**Routing:** `App.tsx` uses `React.lazy` + `Suspense` per route. Each route is wrapped in `PageErrorBoundary`. `AppShell` is the persistent layout wrapper.

**Settings:** `settings.json` drives `autoSaveDebounceMs`, `pollIntervalMs`, `defaultView`, `oneOnOnePeople`, `theme`. `useStaleDetector` polls GitHub on `pollIntervalMs` interval.

---

## Files to read and review

Read all of these:

### Core infrastructure
- `src/lib/schemas.ts` — data contracts
- `src/lib/github.ts` — API layer
- `src/lib/taskConstants.ts` — shared constants
- `src/lib/utils.ts` — shared utilities
- `src/store/useDataStore.ts` — Zustand store
- `src/hooks/useDataFile.ts` — data file hook
- `src/hooks/useSettings.ts` — settings hook
- `src/hooks/useStaleDetector.ts` — polling hook
- `src/hooks/useCollapsed.ts` — collapse state hook
- `src/hooks/useInlineEdit.ts` — inline editing hook

### App shell and routing
- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/PageShell.tsx`
- `src/components/layout/PageErrorBoundary.tsx`
- `src/components/layout/StaleDataBanner.tsx`
- `src/components/layout/SyncStatus.tsx`

### Pages
- `src/pages/FocusPage.tsx`
- `src/pages/TasksPage.tsx`
- `src/pages/ProjectsPage.tsx`
- `src/pages/WeekLogPage.tsx`
- `src/pages/ArchivePage.tsx`
- `src/pages/MemoryPage.tsx`
- `src/pages/SetupPage.tsx`

### Key components
- `src/components/tasks/TaskDialog.tsx`
- `src/components/tasks/TaskBoard.tsx`
- `src/components/tasks/TaskListView.tsx`
- `src/components/tasks/TagFilterBar.tsx`
- `src/components/projects/NewProjectDialog.tsx`
- `src/components/weeklog/GenerateWeekDialog.tsx`
- `src/components/weeklog/NarrativeCard.tsx`

---

## What to look for

Review against the following criteria. For each finding, note the **file**, **approximate line**, and a **concrete fix**.

### 1. Correctness bugs
- Logic errors that would silently produce wrong data (wrong mutations, off-by-one, stale closures)
- Race conditions in async operations (e.g. concurrent saves, polling during dirty state)
- Missing guard clauses that could cause runtime exceptions

### 2. Consistency violations
The codebase enforces these patterns — flag any files that break them:
- All `saveSettings()` calls must be `await`-ed with a `catch { toast.error(...) }` handler
- `setData` mutations must never mutate the real `data` when `filteredData` is in scope (tag filter pattern)
- New files and updated files in `useDataStore` both require `--add` flag in git plumbing (not relevant to runtime, skip)
- `useCallback` / `useMemo` should be present on handlers passed as props or used in `useEffect` deps
- localStorage keys should use the shared constants from `taskConstants.ts`, not hardcoded strings

### 3. Missing error handling
- API calls (`getFile`, `putFile`) that are not wrapped in try/catch at the call site
- `navigator.clipboard.writeText` calls without fallback
- Unhandled promise rejections in `useEffect` async callbacks

### 4. TypeScript strictness
- `any` casts that could be tightened
- Missing return types on exported functions
- Unsafe non-null assertions (`!`) that could realistically fail

### 5. React patterns
- Effects with missing or incorrect dependency arrays (beyond the intentional documented exceptions)
- State initialisers that read from localStorage/DOM on every render instead of using lazy `useState(() => ...)`
- Components that re-render unnecessarily due to unstable prop references

### 6. UX consistency
- Pages or dialogs that lack loading states, error states, or empty states where peers have them
- Keyboard accessibility gaps (missing `aria-label`, focus management in dialogs)
- The `NewProjectDialog` and `TaskDialog` — do they have consistent close-on-backdrop-click, Escape handling, and focus-on-open behaviour?

### 7. Settings page completeness
The `pollIntervalMs` setting controls `useStaleDetector`. Verify:
- The hook correctly skips polling when a file is dirty
- The banner correctly clears after reload
- The toggle theme flow in AppShell is consistent with all other save flows

### 8. Dead code / redundancy
- Imports that are no longer used
- Components or utilities defined but never called
- Duplicated logic that could be extracted

---

## Out of scope

Do **not** flag:
- The `EPERM` git lock warnings (filesystem limitation, cosmetic)
- The single 376KB vendor chunk in the build output (third-party libs, acceptable)
- Missing features (this is a final review, not feature planning)
- Style/formatting preferences with no correctness impact
- shadcn/ui internals in `src/components/ui/`

---

## Report format

Produce a structured markdown report with the following sections:

```markdown
# HECATE Final Review Report

## Summary
One paragraph. Overall assessment, number of findings by priority.

## Critical (must fix before shipping)
Issues that would cause data loss, crashes, or silent corruption.
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## High (should fix)
Correctness issues, missing error handling, broken patterns.
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## Medium (nice to fix)
Consistency violations, suboptimal patterns, UX gaps.
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## Low / Observations
Minor notes, dead code, suggestions — no table needed, prose is fine.

## Verdict
One sentence: ship as-is / ship after critical fixes / needs more work.
```

Be specific. Vague findings like "could be improved" are not useful. If you cannot identify a concrete bug or violation, do not include the finding.
