# Board column

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** custom; dnd-kit `SortableContext`, `useDroppable`

`apps/web/src/board/Column.tsx`

## What it is

One status on the Board: its cards in board order, a drop zone even when empty, and a quick add.

## When to use

- The Board: side by side from `lg`; one per tab below it.

## When not to use → use instead

- n/a

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| container | `color.bg.subtle`, `radius.container`, `space.inset.sm`, `size.container.column` | A `section` named by its heading |
| heading | `text.heading.4`, `Badge` count | Visually hidden inside a tab, whose label says it |
| list | `space.stack.sm`, `size.control.lg` (min height) | The drop zone |
| empty | `text.body.sm`, `color.text.muted` | "Nothing here. Drag a task in, or add one." |
| quick add | `Button` ghost, then a `TextField` "New task in <status>" | Enter adds; stays open for the next |

## Variants

| Prop | Values | Notes |
|---|---|---|
| `heading` | boolean | False inside a tab |

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| empty | The empty line | |
| drag over | The list makes room for the card | |
| loading, error | — | n/a: the page's states (PageShell) |

## Behaviour

- **Adding** puts the task at the end of the column, with a toast naming its key.
- **Responsive (C-10):**
  - from `lg`, columns share the width, at least `size.container.column` each; the board scrolls sideways inside its own focusable region if they do not fit;
  - below `lg`, one column per tab.

## Accessibility (C-08)

- **Element:** `section` named by its `h2`, and a list of cards.
- **Board region:** "Board columns" is focusable for keyboard scrolling.
- **Tabs (narrow):** Radix Tabs, with arrow keys between statuses. A tab panel is not a tab stop of its own (`tabIndex={-1}`): Tab goes from the tab to the column's first control.

## Content (C-09)

- The count is in words ("3 tasks").

## Tokens consumed

`color.bg.subtle`, `color.text.primary`, `color.text.muted`, `radius.container`, `space.inset.sm`, `space.inline.xs`, `space.inline.sm`, `space.stack.xs`, `space.stack.sm`, `size.container.column`, `size.control.lg`, `size.icon.md`, `text.heading.4`, `text.body.sm`

## Code example

```tsx
<Column status={status} keys={keys} cards={cards} onAdd={add} statuses={statuses} onOpen={…} onComplete={…} onReopen={…} onMove={…} />
```

## Related components

- Task card, `TextField`, `Badge`.

## Do / Don't

- **Do** keep an empty column a drop target. Otherwise a status could never be filled by dragging (P-01).

## Open questions

- Collapsing the dropped column when boards grow wide.

## Changelog

- 0.3.0: created.
- 0.11.1: the narrow tab panels are no longer an invisible tab stop (audit 2026-11, finding 3).
