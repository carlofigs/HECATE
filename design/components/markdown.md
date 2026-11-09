# Markdown

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** `react-markdown` + `remark-gfm`

`packages/ui/src/Markdown.tsx`, `packages/ui/src/taskKeys.ts`

## What it is

A workspace's Markdown fields rendered safely: notes, plan details, callouts and keep-in-mind items, with task keys as chips.

## When to use

- Any field the data contract types as `Markdown`.

## When not to use → use instead

- One-line fields (`Line`) → plain text.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| paragraph | inherits | `inline` renders one paragraph without a wrapper |
| list | `space.stack.xs`, `space.inline.lg` | |
| link | `color.text.link` | Always underlined (R-04) |
| code | `text.code`, `color.bg.subtle`, `radius.control` | |
| task key | `KeyChip` | Not inside code or links |
| heading | `text.heading.4` | Rendered as a paragraph, so a field never adds to the page outline (R-13) |
| table | `text.body.sm` | In a focusable scroll region (R-10) |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `inline` | boolean | false | |
| `taskHref` | `(key) => string` | none | Makes the chips links (PR 3) |

## States

All n/a: content, not a control. Its links have the link states.

## Behaviour

- **Safety:** raw HTML is dropped (`skipHtml`). There is no `rehype-raw`, so nothing from the data can inject markup.
- **Responsive (C-10):** text wraps; tables scroll inside their own region.

## Accessibility (C-08)

- **Element:** real lists, links and tables.
- **Headings:** in fields they are demoted, so the page keeps one outline.
- **Tables:** their scroll region is focusable and named "Table".

## Content (C-09)

- It renders what the workspace holds.

## Tokens consumed

`color.text.link`, `color.bg.subtle`, `color.border.default`, `color.border.subtle`, `radius.control`, `text.code`, `text.label`, `text.body.sm`, `text.heading.4`, `space.stack.xs`, `space.stack.sm`, `space.inline.xs`, `space.inline.sm`, `space.inline.lg`

## Code example

```tsx
<Markdown>{item.detail}</Markdown>
```

## Related components

- `KeyChip`

## Do / Don't

- **Don't** add `rehype-raw` or allow HTML. The data is written by people and by Claude, and nothing it holds may run in the page.

## Open questions

- None.

## Changelog

- 0.2.0: created.
