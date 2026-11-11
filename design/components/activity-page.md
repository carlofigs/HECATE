# Activity page and Add to log

**Status:** candidate   **Since:** 0.9.0   **Profile(s):** app   **Base:** `PageShell`, the shared `Section`, `Dialog`

`apps/web/src/activity/ActivityPage.tsx` (rules: `feed.ts`; Worker: `GET /api/workspaces/:dir/activity`, `POST …/activity/ack`)

## What it is

The workspace's activity log, at `/w/<workspace>/activity`, newest first and grouped by day. It holds:
- every task added, finished or archived, and every sprint closed (the engine's events);
- notes from you or Claude: flags and sessions.

Entries new since you last looked are marked **New**. "Since you last looked" is the app's own read marker, `app`. It is kept apart from Claude's (`ack_activity`), as ADR 0002 records.

## When to use

- Activity in the navigation (on phones, under More). The header link shows how many entries are new.

## When not to use → use instead

- **A task's history:** the task itself (the log names its key).
- **Today's state:** Today.

## Anatomy

| Part | Notes |
|---|---|
| subtitle | "7 new since you last looked", or "Nothing new since you last looked" |
| Mark all as read | Primary, while anything is new: in the header from `md`, in the bottom bar below it |
| Add to log | Above the feed at every width |
| day | A `Section` titled with the day ("Tue 10 Nov") |
| entry | Time, then who (You, Claude, Import, Bot) and what (Flag, Session, Event) as `Badge`s in words; the area; the text and its task keys. A new entry has a **New** badge and an accent edge |
| Load older | Under the feed, while older entries remain |
| Add to the log dialog | Kind (Flag or Session), What happened (one line, at most 200 characters), Area (when the workspace has areas), Tasks |

## Variants

- **Something new** and **nothing new.**

## States

| State | Visual | n/a? |
|---|---|---|
| loading | A `Skeleton` while the first page loads | |
| error | A danger `Banner` saying why, with Try again | |
| empty | An `EmptyState`: "Nothing has happened here yet", with Add to log | |
| partial | The snapshot's own banners (`PageShell`) | |
| refused | Add to log: a "Not saved" `Banner`. Mark all as read: a toast saying why | |

## Behaviour

- **What counts as new:** an entry is new when it is past the app's marker and the app did not write it. Your own changes are never new to you.
- **Mark all as read** moves the app's marker to the newest entry. It is the same mechanism as Claude's `ack_activity`, under its own name, so Claude's next briefing still lists what you changed.
- **Markers are not data:** they live in the Durable Object, never in git.
- **Freshness:** the first page reloads whenever the workspace changes, so new entries appear as they are written, Claude's included. Older pages stay valid because the log is append-only.
- **Add to log** sends one `activity.log` op, as the hecate-log skill does.
- **Responsive (C-10):** the feed is one column at every width.

## Accessibility (C-08)

- **Regions:** each day is a region named by its date.
- **Labels in words:** "New", the actor and the kind are words, never colour alone.
- **The header count** reads "Activity 7 new".

## Content (C-09)

- "Say what happened, in a line."
- "Shorten it to 200 characters or fewer (it has 214)."

## Tokens consumed

Those of `PageShell`, `Section`, `Badge`, `KeyChip`, `Banner`, `EmptyState`, `Skeleton`, `Dialog`, the fields and `Button`; `border.width.md`, `color.accent.text`, `space.stack.lg`, `space.stack.xs`, `space.inline.sm`, `space.inline.md`.

## Code example

```tsx
<Route path="activity" element={<ActivityPage />} />
```

## Related components

- The app shell (the count), More, PageShell.

## Do / Don't

- **Do** count new entries with the Worker's rule (its `feed` query), not a second copy.
- **Don't** move Claude's marker from the app.

## Open questions

- Marking a single entry read (`upTo` is already in the API).
- Live updates (P6).

## Changelog

- 0.9.0: created.
