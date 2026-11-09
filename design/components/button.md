# Button

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** native `<button>` / `<a>`

`packages/ui/src/Button.tsx`: `Button`, `ButtonLink`, `IconButton`, plus `buttonStyles()` (router links that look like buttons) and `iconButtonStyles()` (other icon-only triggers, such as the Menu's).

## What it is

An action the user takes now (`Button`). There are two other forms: navigation that looks like an action (`ButtonLink`, `buttonStyles` on a router `Link`), and an action shown only as an icon with a required name (`IconButton`).

## When to use

- **`Button`:** to submit, retry, sign out, or confirm.
- **`ButtonLink`:** to leave the app ("Sign in with GitHub").
- **`buttonStyles` on a router `Link`:** for a single prominent in-app destination ("Go to Today").
- **`IconButton`:** where space is tight and the icon is conventional (sign out). It always carries a name.

## When not to use → use instead

- Ordinary navigation inside text or a list → a link (`text-text-link underline`).
- A task key → `KeyChip`.
- A choice between options → `SelectField`.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| container | `radius.control`, `size.control.default` (min height), `size.target.default` (min width), `space.inline.lg` (padding; none on `IconButton`) | Height follows the device's density: 40 px with a fine pointer, 48 px touch-first |
| label | `text.label` | |
| icon | `size.icon.md` | Decorative (`aria-hidden`); the label or `label` prop names the control |
| focus ring | `border.width.md`, `color.border.focus`, offset `border.width.md` | From `base.css`, for every focusable element |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `variant` | `primary` · `secondary` · `ghost` | `secondary` | `IconButton` takes `secondary` or `ghost` only |
| `icon` | node | none | Shown before the label |
| `tone` | `neutral` · `danger` | `neutral` | `danger`: a destructive action. Secondary weight in danger colours, never primary (R-24) |

No `size` prop yet: density sets the size (DLS.md §1), and nothing has needed another (C-03, P-09).

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | Primary: amber fill, dark text. Secondary: surface, bordered. Ghost: no fill | `color.accent.default`, `color.text.on-accent`, `color.bg.surface`, `color.border.default`, `color.text.primary` | |
| hover | One step: primary lighter, the others take the hover tint | `color.accent.hover`, `color.bg.surface.hover` | Never the only affordance |
| focus-visible | 2 px ring, offset 2 px | `color.border.focus` | |
| active | Primary darker, the others subtle | `color.accent.active`, `color.bg.subtle` | |
| disabled | Half opacity, not-allowed cursor | `opacity.disabled` | |
| loading | — | — | n/a until an action can take long enough to show it. A page-level loading state is PageShell's job |
| error | — | — | n/a: errors are shown next to the failure (Banner, field message), not on the button |
| selected | — | — | n/a: a button is not a toggle |

## Behaviour

- `Button` defaults to `type="button"`, so it never submits a form by accident.
- **Responsive (C-10):** buttons do not change with the breakpoint. The density tokens make them 48 px tall wherever touch-first applies.
- **Overflow:** labels wrap; they are never truncated.

## Accessibility (C-08)

- **Element:** `<button>`, or `<a href>` for `ButtonLink`.
- **Accessible name:** the visible label, or the required `label` prop on `IconButton`, which also becomes its `title`.
- **Keyboard:** Enter and Space for buttons, Enter for links; in tab order.
- **Focus management:** none of its own.
- **Announcements:** none; the result of the action announces itself (Banner, page change).

## Content (C-09)

- Verb first, sentence case, at most about 3 words ("Try again", "Sign in with GitHub").
- No trailing punctuation.

## Tokens consumed

`color.accent.*`, `color.text.on-accent`, `color.text.primary`, `color.bg.surface`, `color.bg.surface.hover`, `color.bg.subtle`, `color.border.default`, `radius.control`, `space.inline.lg`, `space.inline.sm`, `size.control.default`, `size.target.default`, `size.icon.md`, `text.label`, `opacity.disabled`, `motion.duration.fast`

## Code example

```tsx
<Button variant="primary" onClick={save}>Save</Button>
<IconButton label="Sign out" icon={<LogOut aria-hidden="true" className="size-(--size-icon-md)" />} onClick={signOut} />
<Link to="/" className={buttonStyles('primary')}>Go to Today</Link>
```

## Related components

- `Banner`: carries the action that resolves a condition (Retry).

## Do / Don't

- **Do** give every `IconButton` a `label`. An icon alone has no name for a screen reader (R-08).
- **Don't** put two `primary` buttons side by side. The user can't tell which path is intended (P-01, M-app-03).
- **Don't** make a destructive action `primary`. It must never be the default (R-24).

## Open questions

- A `loading` state (spinner or text) when the Board's writes arrive in PR 3.

## Changelog

- 0.2.0: created.
- 0.3.0: `tone="danger"`; `iconButtonStyles()`. Icon buttons no longer inherit text padding, which had squeezed their icons.
