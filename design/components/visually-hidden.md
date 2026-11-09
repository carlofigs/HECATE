# VisuallyHidden

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** Tailwind `sr-only`

`packages/ui/src/VisuallyHidden.tsx`

## What it is

Text for screen readers only.

## When to use

- A state that is visual elsewhere ("Loading…" beside a skeleton).

## When not to use → use instead

- Naming a control → its visible label, or `aria-label` on an icon button.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| text | none | Clipped to nothing visually |

## Variants

None.

## States

All n/a: not interactive and not visible.

## Behaviour

None.

## Accessibility (C-08)

- **Element:** `<span class="sr-only">`.
- **Announcements:** read in place.

## Content (C-09)

Short and literal.

## Tokens consumed

None.

## Code example

```tsx
<VisuallyHidden>Loading…</VisuallyHidden>
```

## Related components

- `Skeleton`

## Do / Don't

- **Don't** hide information sighted users also need. Show it instead (P-01).

## Open questions

- None.

## Changelog

- 0.2.0: created.
