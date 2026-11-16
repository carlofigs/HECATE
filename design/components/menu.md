# Menu

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** Radix `DropdownMenu` (`radix-ui`)

`packages/ui/src/Menu.tsx`

## What it is

A short list of actions behind one icon button.

## When to use

- Several related actions on one item that would crowd it: the card's Move menu (statuses and positions).

## When not to use → use instead

- One or two actions → show them as buttons.
- Choosing a value in a form → `SelectField` or radios.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| trigger | `iconButtonStyles('ghost')`, `size.control.default` | Named by `label` |
| content | `color.bg.raised`, `shadow.overlay`, `radius.container`, `space.inset.xs`, `z.popover` | Above sticky bars, at the popover level |
| item | `size.control.default`, `space.inline.md`, `text.body.md`, `color.bg.surface.hover` (highlight) | Checkable items show a check |
| label, separator | `text.label`, `color.text.secondary`, `color.border.subtle` | |

## Variants

Items are `item` (with optional `checked`), `label` or `separator`.

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| trigger default, hover, focus-visible | As `IconButton` | | |
| item highlighted | Hover tint | `color.bg.surface.hover` | |
| item checked | A check icon plus `aria-checked` | | Not colour alone |
| item disabled | Half opacity, skipped by the arrow keys | `opacity.disabled` | |
| loading, error | — | — | n/a |

## Behaviour

- Opens below the trigger, aligned to its end, and flips to stay in view.
- The positioning offsets come from the space tokens (`tokenPx`).
- Not modal: the page does not lock.
- **Responsive (C-10):** the same at every width.

## Accessibility (C-08)

- **Element:** `button[aria-haspopup=menu]` and `role="menu"` with `menuitem` / `menuitemcheckbox` items.
- **Accessible name:** `label`, e.g. "Move A12".
- **Keyboard:** Enter, Space or the arrows open it; the arrows move; Enter chooses; Escape closes and returns focus.
- **Focus after choosing:** back to the trigger. If the choice re-rendered it elsewhere (Move to another column), focus goes to the visible trigger with the same name; out of sight, it goes to the page's `main`.
- **Item focus:** the keyboard's item shows the focus ring (R-05); the highlight colour alone is not enough.

## Content (C-09)

- Items are verb phrases ("Move to top") or values (a status name), in sentence case.

## Tokens consumed

`color.bg.raised`, `color.bg.surface.hover`, `color.border.subtle`, `color.text.primary`, `color.text.secondary`, `shadow.overlay`, `radius.container`, `radius.control`, `space.inset.xs`, `space.inline.md`, `space.stack.xs`, `size.control.default`, `size.icon.md`, `z.popover`, `opacity.disabled`, `text.body.md`, `text.label`

## Code example

```tsx
<Menu label="Move A12" icon={<MoveVertical aria-hidden="true" />} items={[{ label: 'Move to top', onSelect: top }]} />
```

## Related components

- `IconButton`, the task card.

## Do / Don't

- **Do** disable what cannot apply ("Move up" on the first card), rather than hiding it, so the list stays predictable (P-05).
- **Don't** put a destructive action in a menu without a confirmation (R-24).

## Open questions

- None.

## Changelog

- 0.3.0: created.
- 0.11.1: the ring on the focused item; focus follows a moved trigger (audit 2026-11, findings 2 and 4).
