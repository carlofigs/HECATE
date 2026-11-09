# SelectField

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** native `<select>`

`packages/ui/src/SelectField.tsx`

## What it is

A choice of one option from a short list, with its label always visible.

## When to use

- Switching workspace.
- Any choice of up to about 15 known options.

## When not to use → use instead

- Two or three options shown side by side → radio buttons.
- Free text → a text input.
- Moving between pages → navigation.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| label | `text.label`, `color.text.secondary` | Above the control, or beside it with `inline` |
| control | `size.control.default`, `radius.control`, `color.border.default`, `color.bg.surface`, `space.inline.md`, `text.body.md` | The platform's own `<select>` (P-11); the native arrow is kept |
| focus ring | `border.width.md`, `color.border.focus` | From `base.css` |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `inline` | boolean | false | The label sits beside the control, for toolbars such as the header |

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | Bordered surface | `color.border.default` | |
| hover | Stronger border | `color.border.strong` | |
| focus-visible | Ring | `color.border.focus` | |
| active | The platform's open list | — | |
| disabled | Half opacity | `opacity.disabled` | |
| loading | — | — | n/a: the options are known before render |
| error | — | — | n/a until it is used in a form (PR 3) |
| selected | The chosen option, shown by the platform | — | |
| read-only | — | — | n/a |

## Behaviour

- `onChange` acts immediately (the workspace switcher navigates). There is no separate confirm.
- **Responsive (C-10):** the control shrinks to fit (`min-w-0`), and an inline label wraps above it when space runs out.
- **Overflow:** the platform truncates long option labels.

## Accessibility (C-08)

- **Element:** `<label for>` + `<select>`.
- **Accessible name:** the visible label (R-09).
- **Keyboard:** the platform's own (arrows, type-ahead).
- **Focus management:** none.
- **Announcements:** the platform's.

## Content (C-09)

- The label is a noun ("Workspace").
- Option labels are a workspace's name, or its directory when it has none.

## Tokens consumed

`text.label`, `text.body.md`, `color.text.secondary`, `color.text.primary`, `color.border.default`, `color.border.strong`, `color.bg.surface`, `radius.control`, `size.control.default`, `space.inline.md`, `space.inline.sm`, `space.stack.xs`, `opacity.disabled`

## Code example

```tsx
<SelectField inline label="Workspace" value={dir} options={[{ value: 'planning', label: 'Planning' }]} onChange={e => open(e.target.value)} />
```

## Related components

- `Button`

## Do / Don't

- **Do** keep the label visible, even in a toolbar. A placeholder is not a label (R-09).
- **Don't** restyle the arrow away. The native control is accessible and familiar (P-11).

## Open questions

- None.

## Changelog

- 0.2.0: created.
