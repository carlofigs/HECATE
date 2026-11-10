# People, a person, and the glossary

**Status:** candidate   **Since:** 0.8.0   **Profile(s):** app   **Base:** `PageShell`, the shared `Section`, `Item` and `TaskLine`

`apps/web/src/people/PeopleList.tsx`, `PersonPage.tsx` (rules: `people.ts`; views: `@hecate/core` `peopleList`, `personView`)

## What it is

- **People** (`/w/<workspace>/people`): everyone the workspace records, and its glossary.
- **A person** (`/w/<workspace>/people/<id>`):
  - who they are: role, name and aliases where the workspace allows, and notes;
  - their leave;
  - everything that points at them: the tasks waiting on them, the project cutoffs that name them, the meetings that mention them.

## When to use

- People in the navigation (under More on phones).
- A person's name on the list.

## When not to use → use instead

- **Linking a task or cutoff to someone:** use the Person picker in the task editor or the cutoff editor.

## Anatomy

| Part | Notes |
|---|---|
| sanitised banner | `Banner` info: "This workspace is sanitised: people are recorded by role, never by name." (ADR 0005) |
| person row | The label (name, or role) as the link; the role beside a name; "Away Thu 12 Nov – Fri 13 Nov" when on leave within two weeks; aliases; "1 task waits on them" |
| glossary | A filter (term, alias or meaning); terms alphabetically, each with aliases, project and meaning; Edit, and Remove with an exact **Undo** |
| About | Role, aliases, notes; **Edit**; **Remove** (`tone="danger"`) |
| Leave | Ranges in date order, "Away now" and "Past" badges; Edit, and Remove with an exact Undo; **Add leave** |
| Waiting on them | Open B tasks, titles opening the Board's editor |
| Cutoffs | Date, what, and the project as a link |
| Meetings | Date and title, read-only |
| remove | A `ConfirmDialog` when nothing points at them; otherwise a `Dialog` saying what still does and how to unlink it |

## Variants

- **Open** and **sanitised** workspaces: no name or aliases in a sanitised one, and the banner.
- **Unknown id:** an `EmptyState` with a link to everyone.

## States

| State | Visual | n/a? |
|---|---|---|
| loading, error, partial | From `PageShell` | |
| empty | Each section's own sentence; "No terms match …" when filtering | |
| refused | A toast "Couldn't …" saying why | |
| cannot remove | The explaining dialog | |

## Behaviour

- **Removal is the op's answer.** `personView.removable` comes from applying `person.remove` to a copy of the state, so the page explains exactly what the engine would refuse (a task waiting on them, a cutoff, a meeting).
- **Leave is saved whole** (`person.upsert` with `ooo`), so removing a range can be undone exactly.
- **Terms removed come back** with their id and every field.
- **Responsive (C-10):** one column below `lg`, two from `lg`. **Add person** sits in the bottom bar below `md` (M-app-07).

## Accessibility (C-08)

- **Regions:** each section is a region named by its `h2`.
- **Controls:** each control names its item ("Remove “Fri 20 Nov – Sat 21 Nov: Holiday”").
- **The glossary filter** is a labelled search field.

## Content (C-09)

- "1 task waits on them". "No open task waits on them."
- "Sam is still linked" when removal is refused.

## Tokens consumed

Those of `PageShell`, `Section`, `Item`, `TaskLine`, `Badge`, `Banner`, `Markdown`, `EmptyState`, `TextField`, `Button`, `ConfirmDialog`, `Dialog`; `space.stack.lg`, `space.stack.sm`, `space.stack.xs`, `space.inline.md`, `space.inline.sm`.

## Code example

```tsx
<Route path="people" element={<PeopleList />} />
<Route path="people/:id" element={<PersonPage />} />
```

## Related components

- The person editor, the task editor's Person, the cutoff editor's Person, Today's Cutoffs and leave.

## Do / Don't

- **Do** ask core whether someone can be removed, rather than restating the references here.
- **Don't** show a name or aliases field in a sanitised workspace.

## Open questions

- `person.remove` does not check tasks already archived in a sprint; that belongs in core.

## Changelog

- 0.8.0: created.
