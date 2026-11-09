# Toast

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** Radix `Toast` (`radix-ui`)

`packages/ui/src/Toaster.tsx` (the app's queue: `apps/web/src/toasts.ts`)

## What it is

The confirmation of a completed action, or of a change HECATE refused, without blocking the page (M-app-05).

## When to use

- After complete, reopen, add, save or delete.
- When the Worker refuses a change (danger).
- With **Undo** when the change can be undone exactly.

## When not to use → use instead

- A condition that persists → `Banner`.
- A problem in a form → the field's message and the form's summary.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| root | `color.bg.raised`, `shadow.overlay`, `radius.container`, `space.inset.md` | |
| icon | `color.status.<tone>.icon`, `size.icon.md` | Decorative |
| title, description | `text.label`, `text.body.sm` | "Completed A12", then the task's title |
| action | `size.control.default` | One at most (Undo) |
| close | "Dismiss" | |
| viewport | `z.toast`, `size.container.prose` | Bottom centre; above the bottom bar below `md` |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `tone` | `success` · `danger` · `info` | required | |
| `action` | label, `altText`, handler | none | |

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| hover / focus | The timer pauses | |
| focus-visible | Ring on the action and the close button | |
| disabled, loading, error, selected | — | n/a |

## Behaviour

- **Duration:** stays 8 s (≥ 5 s, M-app-05), pausing while hovered or focused or while the window is in the background.
- **Stacking:** at most three are kept.
- **Dismissal:** swipe down to dismiss.

## Accessibility (C-08)

- **Element:** an `li` in a labelled region ("Notifications"). Radix announces each: danger at once (`foreground`), others politely.
- **Undo:** its `altText` tells a screen-reader user how to do the same without the toast (the card's Move menu).
- **Keyboard:** F8 moves to the region.

## Content (C-09)

- **Title:** the past-tense verb and the key ("Completed A12").
- **Description:** the title of the task.
- **Refusals:** "Couldn't …", then the reason, then "Nothing was changed."

## Tokens consumed

`color.bg.raised`, `color.border.subtle`, `color.border.default`, `color.status.*.icon`, `shadow.overlay`, `radius.container`, `radius.control`, `space.inset.md`, `space.inline.md`, `space.stack.xs`, `size.icon.md`, `size.control.default`, `size.control.lg`, `size.container.prose`, `z.toast`, `text.label`, `text.body.sm`

## Code example

```tsx
pushToast({ tone: 'success', title: 'Completed A12', description: 'Draft the scorecard', action: { label: 'Undo', altText: '…', onAction: undo } })
```

## Related components

- `Banner`

## Do / Don't

- **Do** offer Undo when it restores exactly. The Board puts the card back where it was (R-24).
- **Don't** use a toast for something the person must act on. It disappears (M-app-05).

## Open questions

- None.

## Changelog

- 0.3.0: created.
