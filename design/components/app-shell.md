# App shell

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** custom (`<header>`, `<nav>`, `<main>`)

`apps/web/src/shell/Shell.tsx`, `SyncStatus.tsx`, `Mark.tsx`

## What it is

Everything around a workspace's pages: the skip link, the HECATE mark, the main navigation, the sync status, the workspace switcher and sign-out.

## When to use

- Every page inside a workspace (`/w/:workspace/...`).

## When not to use → use instead

- Sign-in, the not-found page, whole-app failures → a standalone page with its own `main`.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| skip link | `color.bg.raised`, `shadow.overlay`, `z.toast` | Visually hidden until focused |
| header | `color.bg.surface`, `color.border.subtle`, `z.sticky`, `size.container.app` | Sticky |
| mark | `size.icon.lg`, `color.accent.default` | Decorative, beside the text "HECATE" |
| nav item | `text.label`, `border.width.md`, `color.accent.text` | The current page is underlined and carries `aria-current="page"` |
| sync status | `text.body.sm`, `color.text.secondary`, `size.icon.md` | Icon plus words |
| workspace switcher | `SelectField` (`inline`) | |
| sign out | `IconButton` | |
| main | `size.container.app`, `space.inline.lg`/`xl`, `space.stack.lg` | `id="main"`, focusable for the skip link |

## Variants

None.

## States

| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| nav current | Underline plus `aria-current` | `color.accent.text` | |
| nav hover | Text darkens | `color.text.primary` | Never the only affordance |
| focus-visible | Ring | `color.border.focus` | |
| sync: checking | "Checking…" with a refresh icon | | |
| sync: up to date | "Up to date · 10:42" with a cloud-check icon | | |
| sync: saving | "Saving to GitHub (n)", for changes not yet committed | | |
| sync: offline | "Offline" with a wifi-off icon | | |
| sync: failed | "Couldn't load" with a cloud-off icon, when HECATE answered with an error | | |
| disabled, loading, error, selected | — | — | Covered by the sync states and PageShell |

## Behaviour

- **Refreshing:** the open workspace refreshes on window focus, when the page becomes visible, when the connection returns, and every 60 s while visible. No more than once in 5 s. Live updates are P6.
- **Switching workspace** keeps the current page (Today stays Today).
- **Responsive (C-10):** the header wraps. The controls group moves under the brand and navigation on narrow screens, and the sticky header stays one tap from every control.
- **Navigation:** stays in the header while it has one item. It moves to a bottom bar below `md` when the Board adds a second (PR 3, M-app-07).

## Accessibility (C-08)

- **Landmarks:** `header` (banner), `nav` named "Main", `main`.
- **Skip link:** the first Tab stop.
- **Sync status:** `role="status"`, so changes are announced politely.
- **Focus on navigation:** moves to the new page's `h1` (PageShell).

## Content (C-09)

- Sync wording is short and literal.
- Times are in the viewer's clock.

## Tokens consumed

`color.bg.surface`, `color.bg.canvas`, `color.bg.raised`, `color.border.subtle`, `color.accent.text`, `color.accent.default`, `color.text.primary`, `color.text.secondary`, `shadow.overlay`, `z.sticky`, `z.toast`, `size.container.app`, `size.icon.lg`, `size.icon.md`, `size.target.default`, `border.width.md`, `space.*`, `text.heading.4`, `text.label`, `text.body.sm`

## Code example

```tsx
<Route path="w/:workspace" element={<Shell />}>
  <Route path="today" element={<Today />} />
</Route>
```

## Related components

- `PageShell`, `SelectField`, `IconButton`

## Do / Don't

- **Do** keep one primary navigation location, with the current page shown (M-app-02).
- **Don't** show sync state as colour alone. Every state has words (R-04).

## Open questions

- The bottom bar below `md` when the Board lands (PR 3).

## Changelog

- 0.2.0: created.
