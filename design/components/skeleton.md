# Skeleton

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** custom

`packages/ui/src/Skeleton.tsx`

## What it is

Placeholder lines shown at once while a view loads (R-25).

## When to use

- A page or region whose data has not arrived.

## When not to use → use instead

- A refresh of data already shown → keep the data and update the sync status.
- A failed load → `Banner`.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| line | `color.bg.subtle`, `radius.control`, the height of `text.body.md`, `space.stack.sm` | The last line is two thirds wide |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `lines` | number | 3 | |

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| loading | It is the loading state | | |
| all others | — | — | n/a: not interactive |

## Behaviour

- **Static:** no shimmer. That means nothing to reduce under R-12, and nothing that flashes.
- **Responsive (C-10):** fills its container.

## Accessibility (C-08)

- **Element:** `aria-hidden`.
- **Announcements:** the surrounding region carries `aria-busy="true"` and a visually hidden "Loading…".

## Content (C-09)

n/a

## Tokens consumed

`color.bg.subtle`, `radius.control`, `text.body.md`, `space.stack.sm`

## Code example

```tsx
<div aria-busy="true"><VisuallyHidden>Loading…</VisuallyHidden><Skeleton lines={4} /></div>
```

## Related components

- `VisuallyHidden`

## Do / Don't

- **Don't** animate it. It would need a reduced-motion variant for no gain (R-12, P-06).

## Open questions

- None.

## Changelog

- 0.2.0: created.
