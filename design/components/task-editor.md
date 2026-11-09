# Task editor

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** `Dialog`, the field components

`apps/web/src/board/TaskEditor.tsx` (rules: `editor.ts`)

## What it is

Every field of one task, new or existing, in a dialog. It saves as ops, and a status change saves as a move.

## When to use

- Opening a card's title, **New task**, or a `?task=A12` link (Today's titles link here).

## When not to use → use instead

- Moving or completing → the card's controls.
- A quick title → the column's quick add.

## Anatomy

| Part | Notes |
|---|---|
| summary | `Banner` danger, on submit with errors; takes focus |
| fields | Title (required), Kind and Waiting on (new tasks), Status, Due date, Project, Depends on, Urgency, Tags, Note |
| actions | Save / Add task (primary, end), Cancel, and Delete task (`tone="danger"`, start, behind `ConfirmDialog`) |

## Variants

- **New:** with Kind.
- **Edit:** with Delete.

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| error | Field messages after blur; the summary after submit | |
| refused | A `Banner` "Not saved" with the engine's reason | |
| loading | — | n/a: saving is local and immediate; sending shows in the sync status |
| not found | A dialog saying the task is gone (deleted, or archived by a sprint close) | |

## Behaviour

- **Checks** (`editor.ts`):
  - a title, one line, at most 500 characters;
  - depends-on keys that exist and are not the task itself;
  - a date.
- **Saving:** one `task.add`; or a `task.update` of only what changed, plus a `task.move` when the status changed. Tags are slugged, keys upper-cased.
- **Delete:** confirmed first; the key is never reused.
- **Responsive (C-10):** a sheet below `md`, with full-width actions at the bottom; two columns of fields from `md`.

## Accessibility (C-08)

- As `Dialog` and the fields.
- The summary is `role="alert"` and focused.
- Each error is the field's description (`aria-describedby`) and `aria-invalid`.

## Content (C-09)

- Errors say how to fix: "There is no A9 in this workspace."

## Tokens consumed

Those of `Dialog`, `TextField`, `SelectField`, `RadioGroupField`, `Button`, `Banner`; `space.stack.md`, `space.stack.sm`, `space.inline.sm`, `space.inline.lg`.

## Code example

```tsx
<TaskEditor state={state} taskKey="A12" onClose={close} save={actions.save} />
```

## Related components

- Task card, `ConfirmDialog`, Toast.

## Do / Don't

- **Do** send only what changed. A concurrent edit by Claude to another field survives (ADR 0004).
- **Don't** make Delete the primary action (R-24).

## Open questions

- Choosing a person (not only text) for "Waiting on" when People gets its own UI (P5).

## Changelog

- 0.3.0: created.
