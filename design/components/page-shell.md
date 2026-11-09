# PageShell

**Status:** candidate   **Since:** 0.2.0   **Profile(s):** app   **Base:** custom

`apps/web/src/shell/PageShell.tsx`

## What it is

A page over the open workspace's snapshot: its `h1` and every data-view state (R-25, R-26, R-27).

## When to use

- Every page that reads the workspace (Today; the Board in PR 3).

## When not to use → use instead

- Pages that need no workspace → a standalone page.

## Anatomy

| Part | Token(s) | Notes |
|---|---|---|
| heading | `text.heading.1` | The page's only `h1`; focused after a navigation |
| subtitle | `text.body.md`, `color.text.secondary` | From the snapshot, e.g. the date and sprint |
| loading | `Skeleton` in an `aria-busy` region | Shown at once |
| error | `Banner` `danger` | Retry only when it can help |
| partial | `Banner` `warning`: "Showing what HECATE had at 10:42" | The last good data stays below it |
| repository problem | `Banner` `warning` | The snapshot's `lastError` |
| content | children | Rendered from the snapshot |

## Variants

None.

## States

| State | Visual | n/a? |
|---|---|---|
| loading | Heading and skeletons | |
| error | Heading and a danger banner | |
| partial / degraded | Content and a stale banner | |
| empty | The page's own sections say so (each has a line) | |
| ready | Content | |
| hover, focus-visible, active, disabled, selected | — | n/a |

## Behaviour

- **Loading:** the store keeps the last good snapshot when a refresh fails, so data never disappears because the network did.
- **Responsive (C-10):** n/a; the page lays out its own content.

## Accessibility (C-08)

- **Heading:** one `h1` per page (R-13). It has `tabIndex=-1` and is focused after each in-app navigation, so a screen reader starts at the new page.
- **Banners:** announce themselves by role.

## Content (C-09)

- Error copy says what happened, why and what to do (`shell/failure.ts`).

## Tokens consumed

`text.heading.1`, `text.body.md`, `color.text.primary`, `color.text.secondary`, `space.stack.*`

## Code example

```tsx
<PageShell title="Today" subtitle={s => <Subtitle b={briefing(s.state, now)} />}>
  {s => <TodayBody b={briefing(s.state, now)} />}
</PageShell>
```

## Related components

- `Banner`, `Skeleton`, App shell

## Do / Don't

- **Do** compute views from the snapshot with `@hecate/core`, so the app and Claude agree (P-05).
- **Don't** replace data with a spinner on refresh. The sync status shows it instead (P-06).

## Open questions

- None.

## Changelog

- 0.2.0: created.
