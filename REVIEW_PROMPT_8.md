# HECATE — Round 8 Review Prompt for Claude Opus

## Context

HECATE is a personal productivity dashboard (React 19 + TypeScript strict + Vite 6, Zustand +
immer, GitHub Contents API for persistence, deployed as a GitHub Pages SPA). Single-user
personal tool.

Seven prior review cycles have been completed. This is a **Round 8 delta review**, scoped only
to `src/pages/SetupPage.tsx` and `src/lib/taskConstants.ts` as changed in
`c763843 fix(setup): show success toast after Settings-mode reload via sessionStorage handoff`.

Do not re-flag anything resolved in R1–R7. The accepted known issue (auto-fetch `isAborted`
ignores `verifyReqId`) remains accepted and out of scope.

---

## What changed in c763843

**1. New constant in `src/lib/taskConstants.ts`:**
```ts
export const PENDING_TOAST_KEY = 'hecate:pending-toast'
```

**2. New mount-only `useEffect` in `CredentialsSection` (after snap effect, line ~440):**
```tsx
useEffect(() => {
  const msg = sessionStorage.getItem(PENDING_TOAST_KEY)
  if (msg) {
    sessionStorage.removeItem(PENDING_TOAST_KEY)
    toast.success(msg)
  }
}, [])
```

**3. `handleSave` restructured (Settings-mode branch only):**
```tsx
// Before
toast.success(isFirstRun ? 'Connected — welcome to HECATE' : 'Credentials updated')
if (isFirstRun) {
  navigate('/focus', { replace: true })
} else {
  window.location.reload()
}

// After
if (isFirstRun) {
  toast.success('Connected — welcome to HECATE')
  navigate('/focus', { replace: true })
} else {
  sessionStorage.setItem(PENDING_TOAST_KEY, 'Credentials updated')
  window.location.reload()
}
```

---

## Files to read

`src/pages/SetupPage.tsx` — `CredentialsSection` (~lines 388–640), focusing on
the three mount-only `useEffect` blocks and `handleSave`.

`src/lib/taskConstants.ts` — in full (short file).

---

## What to look for

### 1. Mount effect — correct timing and isolation

```tsx
useEffect(() => {
  const msg = sessionStorage.getItem(PENDING_TOAST_KEY)
  if (msg) {
    sessionStorage.removeItem(PENDING_TOAST_KEY)
    toast.success(msg)
  }
}, [])
```

- **Placement**: This effect is the third mount-only `useEffect` in `CredentialsSection`,
  declared after the auto-fetch effect (`[]`) and the snap effect (`[workspaces, workspace]`).
  React runs effects in declaration order after the commit. Is there any ordering dependency
  between this effect and the auto-fetch effect that could cause a problem?

- **React 19 Strict Mode double-invoke**: In development, React 19 mounts, unmounts, and
  remounts each component to surface side-effect bugs. The effect runs twice. First invocation:
  reads the key, removes it, fires toast. Second invocation: key is gone, no-op. Is this
  correct behaviour — toast fires exactly once, then the key is gone?

- **No cleanup function**: The effect has no cleanup return. Is one needed? (Consider: the
  only side-effect is `toast.success`, which is a fire-and-forget enqueue. There is nothing
  to cancel or undo.)

### 2. `sessionStorage` error handling

`sessionStorage.setItem` and `sessionStorage.getItem` can throw in environments where
storage is blocked (e.g., Firefox with `privacy.firstparty.isolate`, iOS Safari private
browsing in some versions, or if storage quota is exceeded).

- If `sessionStorage.setItem(PENDING_TOAST_KEY, ...)` throws in `handleSave`, the next
  statement `window.location.reload()` still executes — credentials are already saved to
  `localStorage`. The only consequence is the toast does not appear after reload. Assess
  whether this is acceptable for a personal tool, or whether a `try/catch` around the
  `setItem` is warranted.

- If `sessionStorage.getItem` throws in the mount effect, the unhandled exception would
  propagate out of the effect and be caught by the nearest React error boundary. Is there
  one in scope for `SetupPage`? If not, would this crash the component tree?

### 3. Key leak scenarios

The key is written in `handleSave` and read+deleted on `CredentialsSection` mount. Consider
every scenario where the key might persist unexpectedly:

- **User writes the key but reload never fires** (e.g., `window.location.reload()` is
  somehow interrupted — theoretically impossible in a browser, but worth noting that this
  can't happen via JS).

- **User navigates away from `/setup` before the reload fires** — again, `reload()` is
  synchronous with respect to the JS thread, so there is no window for navigation before
  reload. Confirm this is a non-issue.

- **User opens a second tab** — `sessionStorage` is tab-scoped (not shared across tabs,
  unlike `localStorage`). A second tab mounting `CredentialsSection` would not find the
  key. Confirm there is no cross-tab leakage.

- **User reloads /setup normally** (F5, browser refresh, not triggered by `handleSave`) —
  `PENDING_TOAST_KEY` is not set, so the effect is a no-op. No stale toast.

- **User closes and reopens the tab** — `sessionStorage` is cleared on tab close. Stale
  key cannot persist across sessions. Confirm.

### 4. First-run path unchanged

The `isFirstRun` branch of `handleSave` was restructured but not functionally changed.
Confirm that:
- `toast.success('Connected — welcome to HECATE')` is still called before `navigate()`.
- `sessionStorage.setItem` is not called in the first-run path.
- The toast still survives `navigate('/focus')` (Sonner portal stays mounted in AppShell).

### 5. Interaction with prior fixes

- The mount effect runs after the auto-fetch effect (declaration order). The auto-fetch
  effect may call `setLoading(true)` and kick off a network request. Does the toast
  displaying simultaneously with a loading spinner produce a confusing UX? (Toast is in
  a portal above the form; they don't interfere with each other structurally — but assess
  whether both appearing together is disorienting.)

- The `PENDING_TOAST_KEY` constant lives in `taskConstants.ts` alongside
  `CREDENTIALS_STORAGE_KEY` and `WORKSPACES_STORAGE_KEY`. Are there any naming or
  namespace concerns? (`hecate:pending-toast` vs `hecate:credentials` / `hecate:workspaces`
  — all share the `hecate:` prefix, all are in the same file.)

---

## Out of scope

- Files not touched by `c763843`
- Issues resolved in R1–R7 (see prior reports)
- The accepted R4-M2 auto-fetch issue
- Style and formatting

---

## Report format

```markdown
# HECATE Round 8 Review

## Summary
One paragraph.

## Critical (data loss / corruption / security)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## High (correctness bugs, broken patterns, missing error handling)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## Medium (UX inconsistencies, missing guards, React pattern issues)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

## Low / Observations
Prose.

## Verdict
One sentence.
```

File and line number required for every finding above Low.
