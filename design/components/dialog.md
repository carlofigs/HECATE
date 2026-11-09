# Dialog and ConfirmDialog

**Status:** candidate   **Since:** 0.3.0   **Profile(s):** app   **Base:** Radix `Dialog`, `AlertDialog` (`radix-ui`)

`packages/ui/src/Dialog.tsx`

## What it is

- **`Dialog`:** a modal for a task that needs attention before going on (the task editor).
- **`ConfirmDialog`:** a modal that confirms a destructive action (R-24).

## When to use

- A form that edits one thing.
- A decision required before continuing (M-app-05).

## When not to use → use instead

- A confirmation of something already done → a toast.
- A persistent problem → `Banner`.
- A short list of actions → `Menu`.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| overlay | `color.bg.overlay`, `z.overlay` | |
| content | `color.bg.raised`, `shadow.modal`, `radius.container`, `space.inset.lg`/`xl`, `z.modal`, `size.container.prose` | A sheet from the bottom below `md` (thumb reach, M-app-07); centred from `md` |
| title | `text.heading.2` | Names the dialog |
| close | `IconButton` "Close" | `Dialog` only |
| actions | `Button` | ConfirmDialog: Cancel, then the action (`tone="danger"`) |

## Variants

| Prop | Values | Default | Notes |
|---|---|---|---|
| `description` | string | none | `Dialog`: optional; `ConfirmDialog`: required |
| `confirmLabel` | string | required | ConfirmDialog: names the action and its object ("Delete A12") |

## States

| State | Visual | n/a? |
|---|---|---|
| default (open) | Overlay and content | |
| focus-visible | The focused control's ring | |
| hover, active, disabled, loading, selected | — | n/a: carried by the controls inside |
| error | A `Banner` inside the form | |

## Behaviour

- **Opening:** focus moves into the dialog.
- **ConfirmDialog:** focus goes to **Cancel**, the default.
- **Closing:** Escape and Close close it (and the overlay, for `Dialog`); focus returns to the opener.
- **Page scroll:** locked while open. Radix inserts a `<style>` element for it, allowed by `style-src-elem` in `apps/web/public/_headers`.
- **Responsive (C-10):** a bottom sheet below `md`, a centred box from `md`.

## Accessibility (C-08)

- **Element:** `role="dialog"` or `role="alertdialog"`, `aria-modal`, and the rest of the page hidden from assistive technology.
- **Accessible name:** the title. ConfirmDialog is also described by its description.
- **Keyboard:** Tab is trapped inside; Escape closes.
- **Focus management:** in on open, back to the trigger on close.

## Content (C-09)

- **Titles:** "Edit A12", "New task", "Delete A12?".
- **A confirmation says what is lost and how to avoid losing it** ("To keep a record instead, move it to a closed status").

## Tokens consumed

`color.bg.overlay`, `color.bg.raised`, `color.border.subtle`, `shadow.modal`, `radius.container`, `space.inset.lg`, `space.inset.xl`, `space.stack.md`, `z.overlay`, `z.modal`, `size.container.prose`, `text.heading.2`, `text.body.md`

## Code example

```tsx
<ConfirmDialog open={asking} onOpenChange={setAsking} title="Delete A12?" description="…" confirmLabel="Delete A12" onConfirm={remove} />
```

## Related components

- `Button` (`tone="danger"`), `Banner`, the task editor.

## Do / Don't

- **Do** put focus on Cancel in a confirmation. A slip of Enter must not destroy anything (R-24).
- **Don't** style the destructive action primary. It must never be the default (R-24).

## Open questions

- None.

## Changelog

- 0.3.0: created.
