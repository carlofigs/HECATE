# Focus item editor and item controls

**Status:** candidate   **Since:** 0.5.0   **Profile(s):** app   **Base:** `Dialog`, the field components, `IconButton`, `Menu`, `ConfirmDialog`

`apps/web/src/today/ItemEditor.tsx` and the item rows in `apps/web/src/today/Today.tsx` (rules: `focus.ts`)

## What it is

The editor and the controls for Today's editable items:
- today's plan;
- this week's priorities and callouts;
- keep-in-mind notes.

One dialog serves every kind, showing only the fields that kind has. The changes are the hecate-focus skill's own ops, so the app and Claude write the same thing.

## When to use

- **Add to plan**, **Add a priority**, **Add a callout** and **Add to keep in mind** under their sections.
- An item's **Edit** button.

## When not to use → use instead

- **The schedule:** it stays read-only. The calendar is its source, Claude captures it, and `focus.setSchedule` replaces the whole week, so an edit here would be overwritten at the next capture.
- **Recording how the day went:** use Close the day (`close-day.md`).
- **A task's own fields:** use the task editor on the Board.

## Anatomy

| Part | Notes |
|---|---|
| item row | The item, then its controls on the right: an `IconButton` "Edit “…”", and either a `Menu` "More for “…”" (Move up, Move down, Remove) or, for keep-in-mind, an `IconButton` "Remove “…”" |
| section footer | The Add button(s), ghost, with a plus |
| summary | `Banner` danger, on submit with errors; takes focus |
| fields | Per kind, below |
| actions | Add … / Save (primary, end), Cancel |

| Kind | Fields |
|---|---|
| Plan item | What to do (required), Detail, Tasks, Urgency |
| Priority | Tier (Focus, Next, Ongoing), Priority (required), Detail, Tasks |
| Callout | Lead (optional), Callout (required), Tasks |
| Keep in mind | Heading (optional), Note (required), Tasks, Project |

## Variants

- **New:** the kind's Add title and submit label ("Add to plan").
- **Edit:** "Edit plan item", and Save.

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| error | Field messages after blur; the summary after submit | |
| refused | A `Banner` "Not saved" with the engine's reason | |
| gone | A dialog saying the item was removed or changed since the page loaded | |
| disabled (menu) | Move up and Move down are disabled at the ends of the list, or of the tier for a priority | |
| loading | — | n/a: saving is local and immediate; sending shows in the sync status |

## Behaviour

- **Checks** (`focus.ts`, sharing `apps/web/src/forms.ts` with the task editor):
  - leads are one line of at most 500 characters (core's `Line`);
  - task keys must exist;
  - a callout or note needs text.
- **Saving:**
  - plan items, priorities and callouts go through `focus.setPlan`, `focus.setPriorities` and `focus.setCallouts`, which **replace the whole list**. Every save sends the full list with each item's id, so ids survive and a closed day's outcomes keep pointing at their plan items;
  - keep-in-mind uses `keepInMind.add`, `keepInMind.update` (only what changed) and `keepInMind.remove`;
  - saving with nothing changed just closes.
- **Moving and removing a list item:**
  - is a toast with **Undo**, which re-sends the list as it was: an exact inverse;
  - a priority moves within its tier.
- **Removing a keep-in-mind note:** asks first (`ConfirmDialog`, Cancel focused). Adding it back would change its place and date, so Undo would not be exact.
- **Concurrency:** a list edit replaces that list as this page has it, as the skill's ops do. An edit Claude made to the same list since the page last loaded is replaced; one to any other list survives.
- **Responsive (C-10):** a sheet below `md`. The row's controls stay beside the item at every width.

## Accessibility (C-08)

- **Controls:** each control names its item: "Edit “Clear the inbox”", "More for “Clear the inbox”". Nothing appears only on hover.
- **The dialog:** as `Dialog` and the fields. The summary is `role="alert"` and focused.
- **Targets:** each control meets `size.target.default`.

## Content (C-09)

- Errors say how to fix: "Say what to do.", "There is no A9 in this workspace."
- Toasts are in the past tense: "Removed from today's plan".
- Labels are imperative, so a refusal reads "Couldn't remove from today's plan".

## Tokens consumed

Those of `Dialog`, `TextField`, `TextAreaField`, `RadioGroupField`, `SelectField`, `IconButton`, `Menu`, `Button`, `Banner`; `size.icon.md`, `space.stack.md`, `space.stack.sm`, `space.stack.xs`, `space.inline.sm`.

## Code example

```tsx
<ItemEditor kind="plan" id={null} state={state} lists={listsOf(briefing)} onClose={close} save={actions.save} />
```

## Related components

- Close the day, the task editor, `ConfirmDialog`, Toast.

## Do / Don't

- **Do** send every item's id with a list. An item without one gets a new id, and outcomes that pointed at it break.
- **Don't** offer an edit to the schedule.

## Open questions

- Editing Last week and the free-form sections (P5 later, or Claude).

## Changelog

- 0.5.0: created.
