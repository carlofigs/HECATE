# Badge and KeyChip

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** custom (`<span>`)

`packages/ui/src/Badge.tsx`

## What it is

- **`Badge`:** a short, non-interactive label for a state: urgency, overdue, outcome, relevance.
- **`KeyChip`:** a task key (A12, B3) set apart from the text around it.

## When to use

- **`Badge`:** a state worth seeing at a glance next to an item ("High", "Overdue", "Done").
- **`KeyChip`:** wherever a task key appears, in lists and inside Markdown.

## When not to use → use instead

- A condition that needs action → `Banner`.
- Anything clickable that is not a task key → `Button` or a link.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| container | `radius.pill` (Badge), `radius.control` (KeyChip), `space.inline.sm` / `space.inline.xs`, `border.width.sm` | |
| text | `text.caption` (Badge), `text.code` + `font.family.mono` (KeyChip) | |
| icon | `size.icon.sm` | Optional on Badge, decorative |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `tone` (Badge) | `neutral` · `accent` · `success` · `warning` · `danger` · `info` | `neutral` | The status tones use the status trios (T-14). `accent` is for "most important" only |
| `href` (KeyChip) | string | none | A link to the task, from PR 3 |

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | Tone trio: background, text, border | `color.status.*`, `color.accent.bg.subtle`/`text`, `color.bg.subtle` | |
| hover | KeyChip with `href` only: the hover tint | `color.bg.surface.hover` | |
| focus-visible | KeyChip with `href` only: ring | `color.border.focus` | |
| active, disabled, loading, error, selected | — | — | n/a: not interactive |

## Behaviour

- **Never wraps** (`whitespace-nowrap`). Badges sit in wrapping rows, so a badge moves to the next line rather than breaking.
- **Responsive (C-10):** no change by breakpoint.

## Accessibility (C-08)

- **Element:** `<span>`, or `<a>` for a KeyChip with `href`.
- **Accessible name:** the text. A linked KeyChip reads "Task A12".
- **Keyboard:** a linked KeyChip is a link; otherwise none.
- **Announcements:** none.
- **Meaning is in the words** ("High", "Overdue"), never the colour alone (R-04).

## Content (C-09)

- A Badge is one or two words, in sentence case.
- A KeyChip is the key exactly as allocated.

## Tokens consumed

`color.status.{success|warning|danger|info}.{bg|text|border}`, `color.accent.bg.subtle`, `color.accent.text`, `color.bg.subtle`, `color.text.secondary`, `color.border.subtle`, `color.text.link`, `radius.pill`, `radius.control`, `text.caption`, `text.code`, `space.inline.xs`, `space.inline.sm`

## Code example

```tsx
<Badge tone="danger">Overdue</Badge>
<KeyChip taskKey="A12" />
```

## Related components

- `Banner`: for conditions, not states.
- `Markdown`: renders KeyChips for keys in text.

## Do / Don't

- **Do** say the state in words. Colour only reinforces it (R-04).
- **Don't** use a status tone decoratively. Status colours mean status (R-22).

## Open questions

- None.

## Changelog

- 0.2.0: created.
