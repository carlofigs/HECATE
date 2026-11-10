# Project editor and project item editor

**Status:** candidate   **Since:** 0.6.0   **Profile(s):** app   **Base:** `Dialog`, the field components

`apps/web/src/projects/ProjectEditor.tsx`, `apps/web/src/projects/ProjectItemEditor.tsx` (rules: `project.ts`)

## What it is

Two dialogs:
- **The project editor:** a project's overview, new or existing.
- **The item editor:** a project's next actions, deadlines, cutoffs and open questions, one dialog showing each kind's fields.

## When to use

- **New project** and **Edit overview**.
- **Add a next action**, **Add a deadline**, **Add a cutoff** and **Add an open question**, and each item's **Edit**.

## When not to use → use instead

- A task's fields → the task editor.

## Anatomy

| Kind | Fields |
|---|---|
| Project | Name (required); Address (new projects only, suggested from the name until edited, permanent); Status; Owner; Phase; Subtitle; Summary; Current focus |
| Next action | Action (required), Tasks |
| Deadline | Title (required), Date (required), Hard deadline, Note, Tasks |
| Cutoff | Date (required), Person (from People; fills Who when it is empty), Who (required: a person, role or team), What closes (required), Tasks |
| Question | Question (required), Blocks the project, Tasks; when editing, Status (Open, Resolved, Deferred) and Resolution (required when Resolved) |

Each dialog also has a summary (`Banner` danger, focused on submit) and the actions: Add … / Save (primary, end), and Cancel.

## Variants

- New and edit, as above.

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| error | Field messages after blur; the summary after submit | |
| refused | A `Banner` "Not saved" with the engine's reason | |
| gone | A dialog saying the item was removed or changed since the page loaded | |
| loading | — | n/a: saving is local and immediate |

## Behaviour

- **Saving the overview:**
  - a new project is one `project.create`;
  - an edit is a `project.update` of only the fields that changed;
  - nothing changed just closes;
  - a new project opens its page.
- **Saving an item:** `project.update` replaces the list whole. Every save therefore sends the full list with each item's id, and each question's number, so "OQ-02" stays OQ-02. A cutoff's Person is its `personId`: choosing None unlinks it and keeps the words in Who. Reopening a question clears its resolution.
- **Checks:**
  - lines are one line of at most 500 characters;
  - the address uses lower-case letters, numbers and single hyphens, and is not already used;
  - dates are dates, and task keys exist.
- **Concurrency:** a list edit replaces that list as this page has it, as the hecate skills' ops do.
- **Responsive (C-10):** a sheet below `md`. The overview's short fields sit two to a row from `md`.

## Accessibility (C-08)

- As `Dialog` and the fields.
- The summary is `role="alert"` and focused.
- Each error is its field's description.

## Content (C-09)

- Errors say how to fix: "Say how it was resolved.", "There is already a project “website”. Choose another."
- The address explains itself: "Used in links to the project. It cannot be changed later."

## Tokens consumed

Those of `Dialog`, `TextField`, `TextAreaField`, `SelectField`, `RadioGroupField`, `CheckboxField`, `Button`, `Banner`; `space.stack.md`, `space.stack.sm`, `space.inline.sm`, `space.inline.lg`.

## Code example

```tsx
<ProjectItemEditor kind="question" id={question.id} state={state} project={project} onClose={close} save={actions.save} />
```

## Related components

- Project pages, the focus item editor (the same pattern), the task editor.

## Do / Don't

- **Do** send every item back with its id, and each question with its number.
- **Don't** offer to change the address of an existing project: links and files depend on it.

## Open questions

- None.

## Changelog

- 0.6.0: created.
- 0.8.0: a cutoff's **Person**.
