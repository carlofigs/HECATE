# Task card

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** custom; dnd-kit `useSortable`

`apps/web/src/board/Card.tsx` (sortable wrapper: `Column.tsx`)

## What it is

One task on the Board: what decides the next action, and every action on it as a visible control.

## When to use

- The Board's columns, and the drag overlay (without its controls).

## When not to use → use instead

- A task in a list to read → Today's task line.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| container | `color.bg.surface`, `color.border.subtle`, `shadow.raised`, `radius.container`, `space.inset.sm` | An `article` named by its key and title |
| drag handle | `size.control.default` | "Drag A12"; the only place a drag starts |
| key, urgency, blocked | `KeyChip`, `Badge` | Status in words |
| title | `text.body.md`, `size.target.default` | A button: opens the editor |
| facts | `text.body.sm`, `color.text.secondary` | Due, blocked by, waiting on, project, tags |
| actions | `IconButton` Complete (or Reopen), `Menu` Move | Always visible |

## Variants

| Prop | Values | Notes |
|---|---|---|
| `closed` | boolean | Done or dropped: muted, struck-through title; Reopen instead of Complete |
| `handle` | node or none | None on the drag overlay, which shows no controls |

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| hover | Title underlines; controls tint | Never the only affordance |
| focus-visible | Each control's ring | |
| active (dragging) | The card in place fades (`opacity.muted`); the overlay follows the pointer | |
| disabled, loading, error | — | n/a: an action applies at once; a refusal is a toast |
| selected | — | n/a |

## Behaviour

- **Complete:** moves the card to the end of the first done status, with a toast and Undo.
- **Move menu:** moves to another status (its end) or within the column.
- **Drag:** by pointer (6 px before it starts) or keyboard (Space, arrows, Space).
- **Responsive (C-10):** the same card at every width. Below `lg` the Board shows one column at a time; moving between statuses there uses the Move menu.

## Accessibility (C-08)

- **Element:** `article` named "A12 Title".
- **Controls:** each is named with the key ("Complete A12", "Move A12", "Drag A12").
- **Drag:** dnd-kit gives the handle its instructions and announces each step ("Picked up A12 …", "A12 is now in To Do, position 2 of 3", "Dropped A12 …").
- **No drag needed:** the Move menu does everything a drag does (WCAG 2.5.7 under R-01).

## Content (C-09)

- Titles wrap and are never truncated.
- Facts are short phrases.

## Tokens consumed

`color.bg.surface`, `color.bg.surface.hover`, `color.border.subtle`, `color.text.primary`, `color.text.secondary`, `shadow.raised`, `radius.container`, `radius.control`, `space.inset.sm`, `space.inline.xs`, `space.inline.sm`, `space.stack.xs`, `size.control.default`, `size.target.default`, `size.icon.md`, `opacity.muted`, `text.body.md`, `text.body.sm`

## Code example

```tsx
<Card card={card} closed={false} statuses={statuses} index={0} count={3} onOpen={open} onComplete={complete} onReopen={reopen} onMove={move} handle={<DragHandle … />} />
```

## Related components

- Board column, `Menu`, `IconButton`, Toast.

## Do / Don't

- **Do** keep every action visible. Touch has no hover (R-07, P4 acceptance).
- **Don't** make the whole card draggable. It would steal clicks and scrolling from the controls on it.

## Open questions

- None.

## Changelog

- 0.3.0: created.
