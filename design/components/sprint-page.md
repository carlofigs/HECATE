# Sprint page and Close sprint

**Status:** candidate   **Since:** 0.7.0   **Profile(s):** app   **Base:** `PageShell`, the shared `Section` and `TaskLine`, `Dialog`

`apps/web/src/sprint/SprintPage.tsx`, `CloseSprint.tsx`, `SprintText.tsx` (rules: `sprint.ts`; views: `@hecate/core` `sprintView`, `sprintList`)

## What it is

One sprint as a whole, at `/w/<workspace>/sprint` for the current sprint and `/w/<workspace>/sprint/<n>` for any other. It shows:
- the sprint's goal and retro, both editable at any time;
- its sections, read-only (v1's week logs arrive here as legacy sprints);
- what closing it archives and carries, or did;
- every sprint, with its counts.

The current sprint is reviewed and closed here.

## When to use

- Sprint in the navigation (on phones, under More).
- Reviewing a sprint before its planning day.
- Writing the retro.

## When not to use → use instead

- **The day's work:** use Today.
- **Moving a task:** use the Board, which every open task here links to.

## Anatomy

| Part | Notes |
|---|---|
| header | "Sprint 7"; the subtitle gives the dates, then "day 8 of 14 · closes Tue 17 Nov", or "Closed Tue 10 Nov"; "‹ Current sprint" on another sprint's page; **Review and close**, primary, while it can be closed |
| Goal, Retro | Markdown, or a sentence saying there is none; an Edit button opens one text area |
| sections | Read-only |
| Tasks, open sprint | Three groups, each from core's preview: "Done: moves to the archive at close", "Dropped: …" and "In progress: carried at close". Titles open the task on the Board |
| Tasks, closed sprint | Three groups from the file: Done, Dropped and Carried. A record: nothing is linked |
| All sprints | Each sprint with its dates and "1 done · 0 carried · 1 dropped"; Current and "From v1" badges; this page's own row is not a link |
| Close sprint dialog | An early-close warning `Banner`; the three groups with counts; Retro, prefilled; **Close sprint 7** (primary) and Cancel |

## Variants

- **Open:** the current sprint, or a past one never closed.
- **Closed.**
- **No cadence:** an `EmptyState` saying "This workspace has no sprints".
- **Unknown number:** an `EmptyState` with a link to the current sprint.

## States

| State | Visual | n/a? |
|---|---|---|
| loading, error, partial | From `PageShell` | |
| empty | Each section's own sentence | |
| refused | In the dialogs, a "Not saved" or "Not closed" `Banner` with the engine's reason | |
| cannot close | No **Review and close**, for example before the sprint starts | |

## Behaviour

- **The preview is the op.** Core's `sprintView` applies `sprint.close` to a copy of the state. The page therefore shows exactly what the engine will do: done and dropped tasks finished by the last day move into the archive; open in-progress tasks are recorded as carried and stay on the board; anything finished later waits for the next close.
- **The close is one op with an explicit sprint number,** and the Worker commits it on its own (ADR 0002). There is no reopen: `git revert` of that commit is the undo, and the dialog says so.
- **Goal and retro:** `sprint.update`, or `sprint.start` when the sprint has no file yet. The retro stays editable after the close.
- **Responsive (C-10):** one column below `lg`, two from `lg`. **Review and close** sits in the bottom bar below `md` (M-app-07).

## Accessibility (C-08)

- **Regions:** each section is a region named by its `h2`; the task groups are `h3`s with their counts.
- **The early-close warning** is a `Banner` (`role="status"`), stated in words.
- **Archived tasks** are text, not links, because the Board no longer holds them.

## Content (C-09)

- **Counts in words:** "1 done · 2 carried · 0 dropped".
- **The dialog's description:** "Closing moves the finished tasks below into the sprint's archive and records what is carried. It is one commit, which can be reverted in git; it cannot be undone here."

## Tokens consumed

Those of `PageShell`, `Section`, `TaskLine`, `Badge`, `KeyChip`, `Markdown`, `EmptyState`, `Dialog`, `TextAreaField`, `Banner`, `Button`; `space.stack.lg`, `space.stack.sm`, `space.stack.xs`, `space.inline.md`, `space.inline.sm`.

## Code example

```tsx
<Route path="sprint" element={<SprintPage />} />
<Route path="sprint/:n" element={<SprintPage />} />
```

## Related components

- Today (its subtitle states the sprint), Projects (archived tasks by sprint), the task editor.

## Do / Don't

- **Do** read what a close will do from `sprintView`, never from a second copy of the rules.
- **Don't** close without naming the sprint: on planning day, the op's default is the previous sprint.

## Open questions

- A velocity chart (would bring in the `viz` profile).
- Setting the cadence from the app.

## Changelog

- 0.7.0: created.
