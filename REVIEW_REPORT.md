# HECATE Final Review Report

## Summary
The codebase is mature, internally consistent, and reflects deliberate design choices (centralised store, ref-based stable callbacks, per-route error boundaries). The architectural patterns are sound. I found 1 Critical issue (a silent data-loss race in auto-save), 5 High-priority issues (missing error handling in keyboard save, perf/store subscription hygiene, dialog accessibility inconsistencies), and a handful of Medium and Low items. Most consistency rules from the prompt are well-respected.

## Critical (must fix before shipping)

| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | `src/store/useDataStore.ts` | ~97-122 | **Silent data loss when an edit lands during an in-flight save.** `saveFile` reads `slice.data`/`slice.sha` *before* `await putFile(...)`. If the user mutates the slice via `setData` while the request is in flight, `setData` sets `dirty=true` and writes new data — but when the in-flight save resolves, the success branch unconditionally sets `dirty=false`. The post-flight edit is now in the store but no longer marked dirty, so the auto-save effect (`useDataFile`) never fires again for it and the change is never persisted. | In `saveFile`'s success handler, only clear `dirty` if the data reference hasn't changed since the snapshot. Capture `const dataAtSnapshot = slice.data` before `await`, then in the post-await `set` do `if (state[name].data === dataAtSnapshot) state[name].dirty = false`. |

## High (should fix)

| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | `src/components/layout/AppShell.tsx` | ~186 | Cmd+S handler does `await Promise.all(toSave.map(name => saveFile(name)))` with no try/catch. A failed save throws unhandled and silently aborts other awaits; user gets no toast. Inconsistent with `useDataFile.save` which always toasts. | Wrap in `try { ... toast.success('Saved') } catch { toast.error('Some files failed to save') }`. Use `Promise.allSettled` so partial failures don't abort. |
| 2 | `src/components/layout/SyncStatus.tsx` | 24 | `const store = useDataStore()` with no selector subscribes the component to **every** store mutation. Causes `SyncStatus` to re-render on every keystroke during inline edits and every drag tick. | Subscribe to derived booleans like AppShell does, or use a `useShallow`-wrapped selector returning the four booleans. |
| 3 | `src/components/projects/NewProjectDialog.tsx` | 113-226 | Hand-rolled modal lacks the accessibility primitives that `TaskDialog` (Radix `Dialog`) gets for free: no focus trap, no `role="dialog"` / `aria-modal`, no return-focus-on-close, no `aria-labelledby`. Backdrop click closes (good), Escape closes (good), but tab can leak to the page behind. Inconsistent with the rest of the app. | Replace the hand-rolled wrapper with `<Dialog>` / `<DialogContent>` from `@/components/ui/dialog`, matching `TaskDialog` and `GenerateWeekDialog`. |
| 4 | `src/pages/TasksPage.tsx` | 96-113 | The `?open=<taskId>` auto-open uses `autoOpenHandled.current = true` on first mount, so subsequent navigations via `TaskIdChip` (e.g. from a project's Linked Tasks → Tasks → click another task chip) won't auto-open the dialog. The ref is never reset. | Reset the guard when the param changes: track the last-handled id in the ref and compare, e.g. `if (autoOpenHandled.current === openId) return; autoOpenHandled.current = openId`. |
| 5 | `src/pages/WeekLogPage.tsx` | 289 | `useDataFile('weekly_log')` returns `error` but the page doesn't surface it; on a 404/network error the body shows the loading skeleton indefinitely. Inconsistent with FocusPage / MemoryPage which use `PageShell`. | Wrap the body in `PageShell` (or render an inline error block when `error` is set), passing `reload` for retry. |

## Medium (nice to fix)

| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | `src/pages/TasksPage.tsx` | 181 | `toggleTag` is a non-memoised inline function passed to `TagFilterBar`, defeating any downstream memoisation. | Wrap in `useCallback`. |
| 2 | `src/pages/WeekLogPage.tsx` | 325 | `sortedWeeks` recomputed on every render (returns a new array reference each time), which forces dependent `useEffect`s and JSX-mapped child keys to re-evaluate. | Wrap in `useMemo([logData?.weeks])`. |
| 3 | `src/pages/ProjectsPage.tsx` | 411 | `LinkedTasksSection` computes `linked` and `grouped` inside the function body on every render via an IIFE — re-walks the entire tasks tree on every keystroke in the parent detail. | Replace the IIFE with `useMemo([tasksData, tag])`. |
| 4 | `src/pages/ProjectsPage.tsx` | 1003 | The page never surfaces a load error; if `projectsData` is null due to network failure, only the "loading skeleton" branch renders forever. | Destructure `error`/`reload` from `useDataFile` and render an error state. |
| 5 | `src/pages/ProjectsPage.tsx` | 519 | `ProjectSectionCard`'s edit pencil uses `opacity-0 group-hover:opacity-100`, but the wrapping element only carries the `group` class on the inner expanded body. When collapsed, the pencil in the header has no `group` ancestor, so it never shows — no way to edit a section without expanding first. | Move/duplicate the `group` class to the outer card div, or place a pencil inside the header that's always visible on hover. |
| 6 | `src/components/tasks/TaskDialog.tsx` | 96-111 | When editing and the user changes the column via the "Column" select, `handleSave` calls `onMove` (which mutates source/dest in tasks via splice) and then `onUpdate(targetCol, built)`. Both stamp `updatedAt` to the same `now`; the move's timestamp is wasted and there are two immer passes / two saves where one would do. | Skip the `onMove` call and instead have `handleUpdate` accept an optional `fromColumnId` and do remove+insert atomically inside the single `setData`. |
| 7 | `src/components/projects/NewProjectDialog.tsx` | 70 | `setTimeout(() => nameRef.current?.focus(), 50)` has no `clearTimeout` in the cleanup returned from the effect. If `open` toggles rapidly the focus call may run after the modal has unmounted. | Capture the timer id, return `() => clearTimeout(id)`. |
| 8 | `src/pages/WeekLogPage.tsx` | 46-51 | `generateWeekMarkdown` formats notes as `\n  > ${note}` for blockquote, but if `note` itself contains newlines they break out of the quote (subsequent lines aren't `>`-prefixed). Multi-line notes render incorrectly. | Replace with `note.split('\n').map(l => '  > ' + l).join('\n')`. |
| 9 | `src/pages/WeekLogPage.tsx` | 457 | Clipboard fallback only toasts on rejection; doesn't fall back to a hidden `<textarea>`+`document.execCommand('copy')` path for browsers/contexts where `navigator.clipboard` is undefined (e.g. older Safari, insecure contexts). | Acceptable as-is for a personal app, but consider feature-detect + `execCommand` fallback. |

## Low / Observations

- **`useDataFile.ts` autoSave debounce**: when the user has unsaved edits and navigates away, the cleanup clears the debounce timer. If the page unmounts *during* the debounce window before the timeout fires, the save is silently skipped and changes remain in store but unpersisted. Next mount of any consumer will see `dirty=true` and re-trigger save. Acceptable but worth noting.
- **`src/lib/utils.ts` `daysSince`**: uses local-timezone `new Date(dateStr)` then sets midnight; for `"YYYY-MM-DD"` strings this parses as UTC, so users in non-UTC timezones may see off-by-one for late-evening edits. Personal-app territory; not a real bug for a Sydney-only user.
- **`src/store/useDataStore.ts`** — many `state[name] as FileSlice<unknown>` casts. Could be tightened with a small generic helper, but doesn't affect correctness.
- **Dead-ish dnd config**: `src/components/tasks/TaskBoard.tsx` imports `KeyboardSensor` and `sortableKeyboardCoordinates` but the keyboard sensor here only enables drag start via keyboard — without a `SortableContext` wrapping the columns/cards, keyboard drag won't actually move tasks. Either remove the keyboard sensor or wrap items in a `SortableContext`.
- **`PageErrorBoundary`** is keyed per route (`key={path}` in `App.tsx`'s `SHELL_ROUTES.map`), so React unmounts/remounts the boundary correctly across navigation. OK.
- **`MemoryPage` ReferencesTab**: `useMemo(..., [])` for `firstFile` is intentional (only on mount), but if the data prop has zero refs at mount and gains them later, the user has to manually click a file. Minor UX rough edge.

## Verdict
Ship after the **Critical** auto-save race fix; the other findings can land in a follow-up.
