# Banner

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** custom (`<div role>`)

`packages/ui/src/Banner.tsx`

## What it is

A condition that persists until it is resolved: a failed load, stale data, a problem the Worker reports (M-app-05).

## When to use

- A page cannot load (danger), shows old data (warning), or HECATE reports a repository problem (warning).

## When not to use → use instead

- Confirming a completed action → a toast (PR 3).
- A problem with one field → an inline field message.
- A decision needed before continuing → a dialog.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| container | `color.status.<tone>.bg`, `color.status.<tone>.border`, `radius.container`, `space.inset.md` | |
| icon | `color.status.<tone>.icon`, `size.icon.md` | One per tone (check, triangle, circle, info), decorative |
| title | `text.label`, `color.status.<tone>.text` | What happened |
| body | `text.body.sm` | Why, and what to do next |
| action | `Button` | Optional; at most one |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `tone` | `success` · `warning` · `danger` · `info` | required | |
| `action` | node | none | Only where acting can help, e.g. Retry |

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | The tone's trio and icon | `color.status.*` | |
| hover, focus-visible, active, disabled, loading, selected | — | — | n/a: not interactive (its action is a Button) |
| error | The `danger` tone | `color.status.danger.*` | |

## Behaviour

- **Lifetime:** it stays until the condition clears. The store removes it when the data loads.
- **Responsive (C-10):** the action wraps below the text on narrow screens.

## Accessibility (C-08)

- **Element:** `role="alert"` for `danger` (announced at once), `role="status"` otherwise (announced politely).
- **Accessible name:** its text.
- **Keyboard:** the action only.
- **Announcements:** by role, when it appears.

## Content (C-09)

R-27 in three parts:

- the title says what happened;
- the body says why, if known, and what to do next.

Plain language, with no codes unless they help.

## Tokens consumed

`color.status.*`, `radius.container`, `space.inset.md`, `space.inline.md`, `space.stack.xs`, `size.icon.md`, `text.label`, `text.body.sm`

## Code example

```tsx
<Banner tone="danger" title="Can't reach HECATE" action={<Button onClick={retry}>Try again</Button>}>
  This device seems to be offline. Check the connection, then try again.
</Banner>
```

## Related components

- `Button`: the action.
- `EmptyState`: for absence rather than failure.

## Do / Don't

- **Do** offer Retry only when retrying can help. A missing workspace won't appear on retry (R-27).
- **Don't** fail silently. Every failed load ends in a banner (R-25).

## Open questions

- None.

## Changelog

- 0.2.0: created.
