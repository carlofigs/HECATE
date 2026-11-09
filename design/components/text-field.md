# TextField, TextAreaField, RadioGroupField and CheckboxField

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** native `<input>`, `<textarea>`, `<fieldset>` + radios, checkbox

`packages/ui/src/fields.tsx`

## What it is

A form field with its label above, an optional hint, and its error beside it (M-app-03, R-09, R-27).

## When to use

- **`TextField`:** one line of text, a date (`type="date"`), or a list typed as text (task keys, tags).
- **`TextAreaField`:** a note in Markdown.
- **`RadioGroupField`:** one choice from two to five, all visible (kind, urgency).
- **`CheckboxField`:** one yes-or-no choice that is not a setting toggled at once ("Also complete A1" when closing the day).

## When not to use → use instead

- A choice from a longer list → `SelectField`.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| label / legend | `text.label` | "(required)" in words, never by colour alone |
| hint | `text.body.sm`, `color.text.secondary` | Linked by `aria-describedby` |
| control | `size.control.default`, `radius.control`, `color.border.default`, `color.bg.surface`, `space.inline.md`, `text.body.md` | |
| error | `text.body.sm`, `color.status.danger.text` | Linked by `aria-describedby`; the control's border turns `color.status.danger.border` |
| radio option | `size.control.default`, `radius.control`; selected: `color.accent.bg.subtle` + `color.accent.text` border | The whole option is the target |
| checkbox | `size.icon.sm` box in `color.accent.text`; the label is `size.control.default` high and at least `size.target.default` wide | The whole label is the target |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `required` | boolean | false | Says "(required)" in the label |
| `hint` | string | none | |
| `error` | string | none | Shown and announced as the description |

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | Bordered surface | `color.border.default` | |
| hover | Stronger border | `color.border.strong` | |
| focus-visible | Ring | `color.border.focus` | |
| disabled | Half opacity | `opacity.disabled` | |
| error | Danger border, message below, `aria-invalid` | `color.status.danger.*` | |
| selected (radio) | Accent tint and border, plus the radio's own dot | `color.accent.*` | Not colour alone |
| read-only, loading | — | — | n/a for now |

## Behaviour

- **When checks show:** a field shows its error once it has been left (blur) or the form submitted. The form then also shows a summary at the top, which takes focus (M-app-03).
- **Responsive (C-10):** full width. Radio options wrap.

## Accessibility (C-08)

- **Element:** `label[for]` + `input`. A fieldset with a legend for radios. A checkbox sits inside its `label`.
- **Accessible name:** the label. The description is the hint, then the error.
- **Keyboard:** native.

## Content (C-09)

- Labels are nouns.
- Errors say how to fix them ("Give the task a title.").

## Tokens consumed

`text.label`, `text.body.md`, `text.body.sm`, `color.text.primary`, `color.text.secondary`, `color.border.default`, `color.border.strong`, `color.bg.surface`, `color.bg.surface.hover`, `color.status.danger.text`, `color.status.danger.border`, `color.accent.bg.subtle`, `color.accent.text`, `radius.control`, `size.control.default`, `size.target.default`, `size.icon.sm`, `space.inline.md`, `space.inline.sm`, `space.inset.sm`, `space.stack.xs`, `opacity.disabled`

## Code example

```tsx
<TextField label="Title" required value={title} error={errors.title} onChange={…} onBlur={…} />
```

## Related components

- `SelectField`, `Banner` (the form's summary), the task editor.

## Do / Don't

- **Do** put the error beside its field and in the summary (R-27, M-app-03).
- **Don't** use a placeholder as the label (R-09).

## Open questions

- None.

## Changelog

- 0.3.0: created.
- 0.5.0: `CheckboxField`.
