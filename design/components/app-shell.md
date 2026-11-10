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
| header | `color.bg.surface`, `color.border.subtle`, `size.container.app` | Outside the scrolling page, so always visible |
| mark | `size.icon.lg`, `color.accent.default` | Decorative, beside the text "HECATE" |
| nav item | `text.label`, `border.width.md`, `color.accent.text` | The current page is underlined and carries `aria-current="page"` |
| sync status | `text.body.sm`, `color.text.secondary`, `size.icon.md` | Icon plus words |
| workspace switcher | `SelectField` (`inline`) | |
| sign out | `IconButton` | |
| main | `size.container.app`, `space.inline.lg`/`xl`, `space.stack.lg` | `id="main"`, the only scrolling area, focusable for the skip link |
| offline banner | `Banner` warning | "You're offline": the data shown is from when the connection dropped, and changes are kept and saved on reconnect |
| update banner | `Banner` info + Reload | "A new version of HECATE is ready" (`UpdateBanner`) |

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

- **Layout:** the shell is an app layout. Header, page and bottom bar fill the viewport (`h-dvh`), and only the page scrolls. Nothing on the page ever sits under the header or the bar, which keeps targets measurable (R-07) and focus unobscured (WCAG 2.4.11).
- **Refreshing:** the open workspace refreshes on window focus, when the page becomes visible, and every 60 s while visible, at most once in 5 s.
  - When the connection returns, waiting changes are sent at once (`retryNow`) and the page catches up.
  - Live updates are P6.
- **Offline:**
  - the offline banner shows while the browser is offline;
  - the sync status counts the changes waiting;
  - while any are waiting, closing or reloading the tab asks first (`beforeunload`; M-app-06).
- **Updates:** the service worker is registered at start-up (`shell/updates.ts`) and checks for a new version on focus and hourly. A waiting version is offered with the update banner, never forced.
- **Switching workspace** keeps the current page (Today stays Today).
- **Responsive (C-10):** the header wraps. The controls group moves under the brand and navigation on narrow screens, and the sticky header stays one tap from every control.
- **Navigation:** Today, Board, Projects and Sprint in the header from `md`; below it, a sticky bottom bar (M-app-07). Only one copy is ever displayed, so there is one `Main` navigation landmark at a time. The pages are listed once, in `apps/web/src/shell/pages.ts`.
  - **In the bottom bar** each page is an icon over a `text.caption` label, at least `size.target.default` wide. It shows Today, Board and **More**, which with the page's action fits at 320 px (the e2e suite checks the bar never overflows on any page).
  - **More** is a page, not a menu: plain links to the pages the bar has no room for (Projects and Sprint; later People and Activity), each with a line on what it is for. It shows as current on those pages too; `aria-current` stays on More's own page.
  - **The workspace switcher** keeps the section: switching on a project page opens the other workspace's Projects.
- **Bottom bar:** below `md`, it also holds the page's primary action (the Board's **New task**) in a slot the page fills.
- **In-app links:** same-origin links to `/w/…` inside the page navigate without reloading (`useInAppLinks`).
- **Toasts:** the shell renders the Toaster.

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

- None.

## Changelog

- 0.2.0: created.
- 0.3.0: the Board in the navigation; the bottom bar with an action slot; toasts; in-app links.
- 0.4.0: the app layout (only the page scrolls); the offline and update banners; an unload warning while changes wait; sending on reconnect.
- 0.6.0: Projects in the navigation; the compact bottom bar; the switcher keeps the section.
- 0.7.0: Sprint in the navigation; More, a page of the pages the bottom bar has no room for.
