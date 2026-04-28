# HECATE — Round 6 Final Clearance Review for Claude Opus

## Context

HECATE is a personal productivity dashboard (React 19 + TypeScript strict + Vite 6, Zustand +
immer, GitHub Contents API for persistence, deployed as a GitHub Pages SPA). It is a
single-user personal tool with no backend.

The `CredentialsSection` component in `src/pages/SetupPage.tsx` has been through five rounds
of incremental review and patching. This is a **holistic final-clearance review** — not a
delta. Read the component as if for the first time. Do not constrain yourself to any commit.

---

## Review history (for context — do not re-flag these)

The following issues were found and fixed across rounds R1–R5. Do not flag anything in this
list. Do use it to skip re-reviewing resolved areas.

| Round | Finding | Resolution |
|-------|---------|------------|
| R1 | Full codebase production-readiness sweep | All Critical/High/Medium fixed |
| R2 | Render-phase auto-fetch (React 19 unsafe) | Moved to `useEffect` with `aborted` flag |
| R2 | `'hecate:credentials'` hardcoded × 5 | Extracted to `CREDENTIALS_STORAGE_KEY` |
| R2 | Corrupt credentials in `handleWorkspaceSwitch` | Guard added |
| R2 | Empty-cache write poisoning | Skip `setItem` when `dirs.length === 0` |
| R2 | `encodeURIComponent` missing in `dataPath` | Added |
| R3 | `doFetchWorkspaces` setters unguarded after abort | `isAborted?: () => boolean` param added |
| R3 | Mid-verify field-edit race (stale credentials committed) | `verifyReqId` ref pattern |
| R3 | Save enabled with stale workspace after failed auto-fetch | Disabled condition tightened |
| R3 | `JSON.parse` null in `handleWorkspaceSwitch` | `typeof creds !== 'object'` guard |
| R4 | `loading` stuck true when verify cancelled by field edit | `setLoading(false)` in field handlers |
| R4 | `disabled` condition still allowed stale save at `workspaces.length === 0` | Removed `workspaces.length > 0 &&` short-circuit |
| R5 | Enter-key from `<select>` bypassed disabled Save button | `workspaces.includes(workspace)` guard added to `handleSave` |
| Accepted | Auto-fetch `isAborted` ignores `verifyReqId` (field-edit during auto-fetch writes stale state) | Accepted: benign because `verifiedCreds` is cleared before stale write and phase 2 is unmounted |

---

## File to read

Read `src/pages/SetupPage.tsx` in full — focus on `CredentialsSection` and its helpers
(`readStoredCredentials`, `doFetchWorkspaces`, `handleVerify`, `handleSave`, the
auto-fetch `useEffect`, and the JSX). Read `src/lib/taskConstants.ts` and
`src/components/layout/AppShell.tsx` if relevant context is needed.

---

## Instructions

Approach this as if the prior reviews never happened. Read the component top to bottom and
look for anything that would block a production release. The review history above exists only
to save you from re-flagging already-resolved issues — it is not a hint that the component
is clean.

Pay particular attention to:

1. **State consistency between `workspace` (React state) and the `<select>` control.** The
   select's displayed value is determined by `value={workspace}`, but the list of options is
   `workspaces.map(...)`. If `workspace` is not in `workspaces`, browsers silently display the
   first option while React state holds the old value. Identify every code path where this
   divergence can arise and whether it leads to a bad user experience or an invalid save.

2. **The phase-1 form's input fields during a verify in flight.** The submit button is
   `disabled={loading}`, but the three `<Input>` fields are `disabled={phase2}` only —
   not `disabled={loading}`. During a verify, `phase2 = false` and `loading = true`: inputs
   are enabled. Pressing Enter in a focused input field while loading submits the phase-1
   form, calling `handleVerify` again. Trace this with the `verifyReqId` pattern and confirm
   it's safe. Then assess whether the enabled inputs during loading are the intended UX.

3. **`handleSave` declared `async`.** It contains no `await`. Is this a problem, or just
   dead syntax?

4. **Security posture of the PAT.** The GitHub Personal Access Token is stored in
   `localStorage` in plaintext as part of the credentials object, used in
   `Authorization: Bearer` headers, and lives in React state as `token`. For a single-user
   personal app deployed on GitHub Pages, assess the risk profile and confirm there are no
   unintended exfiltration vectors (e.g., XSS via workspace names rendered into the DOM,
   the credentials object being passed where it shouldn't be).

5. **Anything else** you would flag in a code review. No constraints — if something looks
   wrong, flag it.

---

## Out of scope

- Files not listed above
- Issues already resolved (see review history table)
- The `window.location.reload()` workspace-switch approach in `AppShell.tsx` (intentional)
- Style and formatting preferences

---

## Report format

```markdown
# HECATE Final Clearance Review

## Summary
One paragraph. Does CredentialsSection pass final clearance?

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
SHIP or DO NOT SHIP — one sentence explaining why.
```

File and line number required for every finding above Low.
