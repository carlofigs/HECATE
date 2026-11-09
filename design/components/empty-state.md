# EmptyState

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** custom

`packages/ui/src/EmptyState.tsx`

## What it is

A whole view with nothing in it: why, and how it fills (R-26).

## When to use

- A page with no data at all (no workspaces yet).

## When not to use → use instead

- An empty section of a populated page → one muted line in the section ("Nothing is in progress.").
- A failure → `Banner`.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| container | `color.bg.surface`, `color.border.subtle`, `radius.container`, `space.inset.xl` | |
| icon | `color.text.muted` | Optional, decorative |
| title | `text.heading.4` | An `h2` or `h3` (`level`), to fit the outline |
| body | `text.body.md`, `color.text.secondary`, `size.container.prose` | |
| action | `Button` | Optional |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `level` | 2 · 3 | 2 | The heading level (R-13) |

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | As anatomy | | |
| empty | It is the empty state | | |
| hover, focus-visible, active, disabled, loading, error, selected | — | — | n/a: not interactive |

## Behaviour

- Centred.
- **Responsive (C-10):** the body is held to the prose measure.

## Accessibility (C-08)

- **Element:** a `div` with a real heading.
- **Accessible name:** n/a.
- **Keyboard:** the action only.
- **Announcements:** none.

## Content (C-09)

- The title states the absence ("No workspaces yet").
- The body says how it fills.

## Tokens consumed

`color.bg.surface`, `color.border.subtle`, `color.text.primary`, `color.text.secondary`, `color.text.muted`, `radius.container`, `space.inset.xl`, `space.stack.sm`, `text.heading.4`, `text.body.md`, `size.container.prose`

## Code example

```tsx
<EmptyState title="No workspaces yet">Run the migration, then come back.</EmptyState>
```

## Related components

- `Banner`

## Do / Don't

- **Do** say how the view fills. A bare "No data" leaves the user stuck (R-26).

## Open questions

- None.

## Changelog

- 0.2.0: created.
