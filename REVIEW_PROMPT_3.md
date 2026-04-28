# HECATE — Round 3 Review Prompt for Claude Opus

## Context

HECATE is a personal productivity dashboard (React 19 + TypeScript strict + Vite 6, Zustand +
immer, GitHub Contents API for persistence, deployed as a GitHub Pages SPA).

Two prior review cycles have been completed:

- **Round 1** — full production-readiness review. All Critical and High/Medium findings resolved.
- **Round 2** — focused workspace feature review. All findings resolved in the last commit:
  `c79bb5a fix(workspace): resolve all REVIEW_REPORT_2 findings`

This is a **Round 3 delta review**, scoped only to the files changed in `c79bb5a`. Do not
re-review anything not touched by that commit.

---

## What changed in c79bb5a

Round 2 found a render-phase side effect, a hardcoded localStorage key, a missing corrupt-
credentials guard, a cache-poisoning bug, and a URL-encoding gap. The fix commit addressed all
of them:

1. **`src/lib/taskConstants.ts`** — added `CREDENTIALS_STORAGE_KEY = 'hecate:credentials'`.
2. **`src/lib/github.ts`** — `dataPath()` now `encodeURIComponent`s both `workspace` and
   `name`; `loadCredentials()` uses `CREDENTIALS_STORAGE_KEY` instead of a hardcoded string.
3. **`src/components/layout/AppShell.tsx`** — replaced all `'hecate:credentials'` literals
   with `CREDENTIALS_STORAGE_KEY`; added a corrupt-credentials guard in
   `handleWorkspaceSwitch`; added `navigate` to the `useCallback` dependency array.
4. **`src/pages/SetupPage.tsx`** — removed the local `STORAGE_KEY` const and imported
   `CREDENTIALS_STORAGE_KEY`; moved the render-phase auto-fetch (`void doFetchWorkspaces(...)`)
   into a `useEffect` with an `aborted` flag for cleanup; skips `localStorage.setItem` when
   `dirs.length === 0`; improved empty-repo error message.

---

## Files to read

Read all of these in full before starting:

- `src/lib/taskConstants.ts`
- `src/lib/github.ts`
- `src/components/layout/AppShell.tsx`
- `src/pages/SetupPage.tsx` — focus on `CredentialsSection` (~lines 380–590)

---

## What to look for

### 1. useEffect auto-fetch correctness

The new `useEffect` in `CredentialsSection`:

```tsx
useEffect(() => {
  if (!stored || workspaces.length > 0) return
  let aborted = false
  setLoading(true)
  doFetchWorkspaces(stored.token, stored.owner, stored.repo, stored.workspace)
    .catch(err => {
      if (!aborted) toast.error(`Could not load workspaces: ${(err as Error).message ?? 'Network error'}`)
    })
    .finally(() => { if (!aborted) setLoading(false) })
  return () => { aborted = true }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

- `stored` is computed by calling `readStoredCredentials()` directly in the component body
  (not in state or a ref). Is it safe to close over `stored` in the effect? Could it be stale
  or produce a different value between the render and when the effect runs?
- The `aborted` flag prevents `toast.error` and `setLoading(false)` after unmount — but
  `doFetchWorkspaces` itself calls `setWorkspaces` and `setWorkspace`. Are those calls also
  guarded? What happens if the component unmounts mid-fetch and those setters fire?
- The `// eslint-disable-next-line react-hooks/exhaustive-deps` suppresses a lint warning.
  What deps is the linter complaining about? Are any of them genuinely required (i.e., would
  the effect be incorrect without them), or are they all stable references that are safe to
  omit?
- In StrictMode, this effect will run twice (mount → unmount → remount). The cleanup sets
  `aborted = true`, but the first fetch is still in flight. The second mount creates a new
  `aborted` closure. Do the two fetches interfere? Is there a race where the first fetch's
  `setWorkspaces` fires after the second mount has already populated state?

### 2. doFetchWorkspaces state updates after unmount

`doFetchWorkspaces` calls `setWorkspaces` and `setWorkspace` unconditionally. These are called
from both the `useEffect` path (where `aborted` guards `toast` and `setLoading` but NOT the
setters) and the `handleVerify` path (where there is no unmount guard at all). Evaluate:

- Is a state-update-after-unmount here actually harmful in React 19? React 18+ suppressed
  the warning but the underlying question is whether a stale setter call causes incorrect
  behaviour (e.g. triggering a re-render of a remounted instance with wrong data).
- If it is a real risk, what is the minimal fix?

### 3. `stored` computed at render time in the component body

```tsx
const stored = readStoredCredentials()
```

This is called unconditionally on every render. `readStoredCredentials` does a `localStorage`
read and `JSON.parse`. Evaluate:

- Performance: is this a meaningful cost on every render in the Settings page (which can
  re-render frequently due to other state changes)?
- Correctness: the result is used both in `useState` initialisers (run once, fine) and in the
  `useEffect` dependency closure (runs once on mount, fine). Are there any other call sites
  where a stale value from a prior render could cause a bug?
- Would `useMemo` or `useRef` (computed once) be more appropriate? Or is this fine as-is?

### 4. Phase-1 → Phase-2 state machine edge case

When `handleVerify` succeeds:
- `doFetchWorkspaces` sets `workspaces` + `workspace`
- then `setVerifiedCreds` is called

If the user edits a field before `handleVerify` resolves (clicks the input and starts typing),
`handleTokenChange`/`handleOwnerChange`/`handleRepoChange` reset `verifiedCreds → null` and
`workspaces → []`. But `doFetchWorkspaces` has already captured `t`, `o`, `r` in its closure
and will still call `setWorkspaces` / `setWorkspace` / then `handleVerify` continues to call
`setVerifiedCreds` — all with the old values. The `setLoading(false)` in `finally` still runs.
Is there a guard needed here? What is the user-visible symptom, and how severe is it?

### 5. handleVerify missing finally setLoading(false) on dirs.length === 0 path

```tsx
async function handleVerify(e: React.FormEvent) {
  ...
  setLoading(true)
  try {
    const dirs = await doFetchWorkspaces(t, o, r)
    if (dirs.length === 0) {
      toast.error('No workspace directories found — ...')
      return          // ← early return INSIDE try, before finally
    }
    setVerifiedCreds({ token: t, owner: o, repo: r })
  } catch (err) {
    toast.error(`GitHub error: ...`)
  } finally {
    setLoading(false)
  }
}
```

The `return` is inside the `try` block, but `finally` always runs — so `setLoading(false)` IS
called. Confirm this is correct and document it clearly. (Prior reviews may have flagged this
incorrectly.)

### 6. AppShell handleWorkspaceSwitch — JSON.parse without schema validation

```tsx
const creds = JSON.parse(raw)
if (!creds.token || !creds.owner || !creds.repo) {
  toast.error('Credentials incomplete — please reconnect in Settings')
  navigate('/setup')
  return
}
creds.workspace = next
localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(creds))
```

- `JSON.parse` can succeed but return a non-object (e.g. `null`, a number, a string). Is
  `creds.token` safe to access in all those cases?
- The guard checks `token`, `owner`, and `repo` but not `workspace`. Is that intentional?
  After the switch, `workspace` is always set explicitly, so pre-existing value doesn't
  matter — but is the absence of a `workspace` field in the stored object ever reachable?
- `localStorage.setItem` can throw (`QuotaExceededError`) in private-mode browsers. The
  `try/catch` catches it and toasts, but `window.location.reload()` is called *after* the
  try block — so a `setItem` failure correctly aborts the reload. Verify this control flow.

### 7. taskConstants.ts — naming and file scope

`taskConstants.ts` now exports storage keys that are not task-specific (`CREDENTIALS_STORAGE_KEY`,
`WORKSPACES_STORAGE_KEY`). Evaluate whether renaming the file to `storageConstants.ts` (or
`constants.ts`) is warranted, or whether keeping everything in one file is preferable for a
codebase of this size. Flag this as a Low / housekeeping observation only — not a bug.

### 8. encodeURIComponent in dataPath — double-encoding risk

```ts
function dataPath(creds: GitHubCredentials, name: string): string {
  return `${encodeURIComponent(creds.workspace)}/${encodeURIComponent(name)}.json`
}
```

This URL segment is passed to the GitHub Contents API. The API accepts the path as a URL
path segment — not a query string — so percent-encoding is correct for non-ASCII characters.
However, workspace names and file names in HECATE are always simple alphanumeric strings
drawn from GitHub directory names (`endeavour`, `tasks`, etc.). Is there any realistic
scenario where `encodeURIComponent` changes the output? If not, is there a risk that the
encoding causes a *double-encode* (e.g., if the calling code also encodes the full URL)?
Trace the full URL construction in `getFile` and `putFile` to confirm.

---

## Out of scope

Do **not** flag:

- Issues in files not changed in `c79bb5a`
- The `window.location.reload()` workspace-switch approach (intentional)
- Style or formatting preferences
- Anything covered and resolved in REVIEW_REPORT.md or REVIEW_REPORT_2.md

---

## Report format

```markdown
# HECATE Round 3 Review

## Summary
One paragraph overall assessment.

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
Prose. Housekeeping notes only.

## Verdict
One sentence.
```

Be specific. File and line number required for every finding. If you cannot identify a
concrete issue at a specific location, do not include the finding.
