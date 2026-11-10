# Project list and project page

**Status:** candidate   **Since:** 0.6.0   **Profile(s):** app   **Base:** `PageShell`, the shared `Section`, `Item` and `TaskLine` (`apps/web/src/sections.tsx`)

`apps/web/src/projects/ProjectList.tsx`, `apps/web/src/projects/ProjectPage.tsx` (views: `@hecate/core` `projectList`, `projectView`)

## What it is

- **The list** (`/w/<workspace>/projects`): every project, live ones first, each with what needs attention.
- **The project page** (`/w/<workspace>/projects/<slug>`): one project and everything linked to it:
  - its tasks, archived ones included, under the sprint that closed them;
  - next actions, open questions, deadlines and cutoffs, each editable;
  - the timeline, refs and free-form sections, read-only for now.

Both read core's project views, so the app and Claude's `find_tasks` agree on a project's tasks.

## When to use

- Projects in the navigation.
- A project's name in the list.

## When not to use → use instead

- **Moving or completing a task:** use the Board, or the task editor this page opens.
- **The day's work:** use Today.

## Anatomy

| Part | Notes |
|---|---|
| list row | The name as the link (`size.target.default` high), a status `Badge` in words, the subtitle, and a facts line: open tasks, open questions and blockers, the next deadline (Hard or Overdue as badges), the phase |
| list sections | **Live** (active, blocked, paused, planned) and **Closed** (done, dropped), the latter only when there is one |
| page header | "‹ Projects" (PageShell `back`), the name as the `h1`, the subtitle; **New task**, primary |
| Overview | Status, phase and owner; the summary; the current focus as a callout; refs; **Edit overview** |
| Next actions | `Item` rows: Edit, and a menu with Move up, Move down and Remove |
| Open questions | "OQ-01", status and Blocker badges, the question, the resolution; Edit, Remove |
| Tasks | Three groups. **Open** and **Finished, still on the board** are `TaskLine`s whose titles open the task editor here (`?task=A3`). **Archived in sprint 6** shows key, title and status, unlinked, because the Board no longer holds them |
| Deadlines, Cutoffs | Date, title or who, badges; Edit, Remove |
| Timeline, sections | Read-only |

## Variants

- **Empty list:** an `EmptyState` with **New project**.
- **Unknown slug:** an `EmptyState` "No project “x”" with a link to all projects.

## States

| State | Visual | n/a? |
|---|---|---|
| loading, error, partial | From `PageShell` | |
| empty section | The section's own sentence ("No deadlines.") | |
| not found | As Variants | |
| refused change | A danger toast "Couldn't …" saying why; the page shows the Worker's state again | |

## Behaviour

- **Order:**
  - the list orders live projects by status (active, blocked, paused, planned), then by name;
  - tasks are in board order, archived ones newest sprint first;
  - deadlines and cutoffs are by date, questions by number.
- **Removing** a next action, question, deadline or cutoff re-sends the list without it, with an exact **Undo**.
- **The primary action:** **New project** on the list, **New task** on a project, in the header from `md` and the bottom bar below it (M-app-07). A task started here has the project chosen.
- **Responsive (C-10):** one column below `lg`, two from `lg`.

## Accessibility (C-08)

- **Landmarks:** each section is a region named by its `h2`; the task groups are `h3`s.
- **Controls:** each control names its item ("Edit “OQ-01”", "Remove “Legal: Contract review”").
- **Status:** always in words, never colour alone (R-04).

## Content (C-09)

- Counts in words: "2 open tasks", "1 open question, 1 blocking".
- "Next deadline Fri 20 Nov: Launch".

## Tokens consumed

Those of `PageShell`, `Section`, `Item`, `TaskLine`, `Badge`, `KeyChip`, `Markdown`, `EmptyState`, `Button`; `space.stack.lg`, `space.stack.sm`, `space.stack.xs`, `space.inline.md`, `space.inline.sm`, `border.width.md`, `color.accent.text`.

## Code example

```tsx
<Route path="projects" element={<ProjectList />} />
<Route path="projects/:slug" element={<ProjectPage />} />
```

## Related components

- The project editor, the task editor, PageShell.

## Do / Don't

- **Do** read a project's tasks through `projectView`, which is `findTasks` with `scope: 'all'`.
- **Don't** link an archived task to the Board: it is not there.

## Open questions

- Editing the timeline, refs and sections.

## Changelog

- 0.6.0: created.
