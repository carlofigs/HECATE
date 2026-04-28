# HECATE — Workspace Feature Review Prompt for Claude Opus

## Context

HECATE is a personal productivity dashboard (React 19 + TypeScript + Vite, Zustand + immer,
GitHub Contents API for persistence, deployed as a GitHub Pages SPA). It had a full
production-readiness review previously — all Critical and most High/Medium findings from that
review have been resolved.

This is a **focused delta review** of the workspace feature added after that review. The rest
of the codebase is considered stable. Do not re-review files that haven't changed.

---

## What changed

HECATE previously read/wrote data from a fixed path `data/{file}.json` in a single repo
configured in Settings. The new workspace feature:

1. Moves data to `{workspace}/{file}.json` — the workspace is a top-level directory in a
   separate private data repo (e.g. `HECATE_Data/endeavour/tasks.json`).
2. Adds `workspace: string` to `GitHubCredentials` (stored in `localStorage`).
3. Caches the list of available workspaces in `localStorage` (`hecate:workspaces`).
4. Replaces the single-step credentials form in `SetupPage` with a two-phase flow:
   - Phase 1: enter token / owner / repo → "Verify & load workspaces" (hits GitHub Contents
     API to list root-level directories)
   - Phase 2: pick workspace from dropdown → "Save & connect"
5. Adds a workspace switcher dropdown to the `AppShell` sidebar (below the HECATE wordmark).
   Switching updates `localStorage` and calls `window.location.reload()`.

---

## Files to read

Read all of these in full:

- `src/lib/github.ts` — pay attention to `dataPath()`
- `src/lib/schemas.ts` — `GitHubCredentials` interface
- `src/lib/taskConstants.ts` — `WORKSPACES_STORAGE_KEY`
- `src/pages/SetupPage.tsx` — full two-phase `CredentialsSection` (lines ~380–600)
- `src/components/layout/AppShell.tsx` — workspace switcher state + render (lines ~167–230 and ~270–290)

---

## What to look for

Focus specifically on these categories for the workspace-related code:

### 1. Correctness and race conditions
- The auto-fetch on mount (`didAutoFetch.current` guard + `void doFetchWorkspaces(...)`) —
  does it handle the case where the component unmounts before the fetch resolves? Is there a
  stale-closure or state-update-after-unmount risk?
- `handleWorkspaceSwitch` reads credentials from `localStorage` inside the callback. Is there
  a scenario where `localStorage` is out of sync with what the component rendered?
- Phase 2 `handleSave` — could `verifiedCreds` be stale relative to what's actually in
  `localStorage` at save time (e.g. if two tabs are open)?
- The `void doFetchWorkspaces(...)` call during render — this is called conditionally inside
  the component body (not in a `useEffect`). Is this safe in React 19's concurrent renderer?
  Could it be called multiple times?

### 2. Security and data hygiene
- `WORKSPACES_STORAGE_KEY` caches directory names in `localStorage`. Are there XSS or
  injection risks if malicious directory names are read back into the DOM (e.g. as `<option>`
  values)?
- `handleWorkspaceSwitch` reads, parses, patches, and re-serialises the full credentials
  object from `localStorage`. What happens if the stored JSON is malformed at switch time?
- The PAT is stored in `localStorage` alongside the workspace. Any concerns about the
  credentials shape diverging between what's in memory and what's in `localStorage`?

### 3. UX state machine correctness
- When the user clicks "Change" in phase 2 (resets `verifiedCreds` to null), `workspaces`
  is NOT cleared. So the previous workspace list remains visible if the user re-verifies the
  same repo. Is this intentional, and does it cause any visual inconsistency?
- If `doFetchWorkspaces` resolves with 0 directories (e.g. all items in the repo root are
  files, not dirs), the phase-1 form shows a toast but does NOT set `verifiedCreds`. The
  `workspaces` state remains `[]` and `WORKSPACES_STORAGE_KEY` is written as `"[]"`. On next
  mount the component enters phase 2 (because `stored` exists) but the dropdown is empty and
  the auto-fetch fires again. Is this loop benign?
- First-run flow: if a first-time user hits "Verify & load workspaces" but the repo has no
  directories yet, they're stuck — there's no affordance to create a workspace. Is this worth
  a specific error message?

### 4. React patterns
- `didAutoFetch.current` is used as a module-level guard inside the component body (not a
  `useRef` in the traditional sense — it IS a useRef, but the check happens at render time
  outside of any effect). Verify this is safe with StrictMode double-invoke.
- `handleWorkspaceSwitch` is wrapped in `useCallback([currentWorkspace])`. The callback
  closes over `currentWorkspace` which is updated on switch. Is the dependency correct, or
  could there be a stale closure if the user switches twice quickly before a re-render?
- `AppShell` reads `workspaces` from `localStorage` into state once on mount and never
  refreshes it. If the user adds a new workspace in Settings and returns to the sidebar
  without a full reload, the switcher will still show the old list. Is this acceptable?

### 5. Missing error handling
- `doFetchWorkspaces` is called with `void` from the component body (auto-fetch path). If it
  throws (network error, bad credentials), the error is silently swallowed. Should it set an
  error state or toast?
- `handleWorkspaceSwitch` wraps the localStorage patch in `try/catch` and shows a toast on
  error. But `window.location.reload()` is called before the try block exits — if the JSON
  parse fails, will `reload()` still be called? Trace the control flow.

### 6. Consistency with existing patterns
- Verify that the `STORAGE_KEY` constant used in `SetupPage` for credentials is consistent
  with the `'hecate:credentials'` string used in `AppShell` and `useDataStore`. Is it the
  same string or could they diverge?
- The previous review flagged that `localStorage` keys should use shared constants from
  `taskConstants.ts`. `WORKSPACES_STORAGE_KEY` is correctly added there. Check whether the
  credentials key (`'hecate:credentials'`) is now the only hardcoded localStorage string
  remaining, and whether it should also be extracted.

---

## Out of scope

Do **not** flag:
- Issues in parts of the codebase not touched by the workspace feature
- Style or formatting preferences
- The `window.location.reload()` approach for workspace switching (intentional simplicity;
  a reactive reload is a future enhancement)
- The lack of a "create workspace" UI (out of scope for this feature)

---

## Report format

```markdown
# HECATE Workspace Feature Review

## Summary
One paragraph. Overall assessment of the workspace feature, findings by priority.

## Critical (data loss / silent corruption / security)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## High (correctness bugs, broken patterns, missing error handling)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## Medium (UX inconsistencies, missing guards, React pattern issues)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## Low / Observations
Prose. Minor notes only.

## Verdict
One sentence.
```

Be specific. If you cannot identify a concrete bug or violation with a file and line number,
do not include the finding.
