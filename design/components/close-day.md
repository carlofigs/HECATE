# Close the day

**Status:** candidate   **Since:** 0.5.0   **Profile(s):** app   **Base:** `Dialog`, the field components, `CheckboxField`

`apps/web/src/today/CloseDay.tsx` (rules: `focus.ts`)

## What it is

End of day as a form: the hecate-focus skill's EOD. It records:
- how each plan item went: Done, Carried or Dropped, with a note;
- what else was done;
- a note on the day.

It saves as one `focus.closeDay`, plus `task.complete` for any task the person chose to complete, all in the same batch.

## When to use

- **Close the day** under today's plan.
- **Edit how today went** once the day is closed (`focus.closeDay` can be run again; there is no reopen).

## When not to use → use instead

- Changing the plan before the day ends → the plan's items (`focus-item-editor.md`).
- Closing an earlier day left open → Claude, for now.

## Anatomy

| Part | Notes |
|---|---|
| plan rows | One fieldset per plan item, its lead as the legend: the item's task keys, How it went (Done, Carried, Dropped), "Also complete A1" when Done and a named task is open, Note |
| unplanned rows | "Something else you did": What you did (required), How it went, Tasks, "Also complete", Note, and Remove |
| Add something else | A ghost button that adds an unplanned row |
| How the day went | A text area: the day's note |
| actions | Close the day / Save (primary, end), Cancel |

## Variants

- **Close:** titled "Close Wed 11 Nov". Each item starts as **Carried** unless every task it names is already closed; nothing is marked done unless the person says so.
- **Edit:** titled "Edit how Wed 11 Nov went", starting from the saved outcomes and note. Outcome ids are kept.

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| error | An unplanned row's messages after blur; the summary after submit | |
| refused | A `Banner` "Not saved" with the engine's reason | |
| empty plan | "Nothing was planned for Wed 11 Nov.", with unplanned rows still available | |
| loading | — | n/a: saving is local and immediate |

## Behaviour

- **Links:** each plan row's outcome carries its plan item's id (`planItemId`). The id is fixed when the plan is saved, so the Worker gets the same one the page shows.
- **Also complete:**
  - offered only for a Done row that names an open task;
  - unticked until chosen, because completing a task is a separate decision from finishing the plan item.
- **Checks:** an unplanned row needs one line saying what was done; its task keys must exist.
- **After saving:** Today shows "How today went" in place of the plan, with the note, and a toast counts the outcomes.
- **Responsive (C-10):** a sheet below `md` that scrolls; radio options wrap.

## Accessibility (C-08)

- **Grouping:** each row is a fieldset named by its lead, so "How it went" and "Note" are heard with the item they belong to.
- **The summary:** `role="alert"` and focused.
- **The checkbox:** named by its whole label ("Also complete A1"), and the label is the target.

## Content (C-09)

- **The description:** "Say how each part of the plan went. Carried means it moves on; nothing is marked done unless you say so."

## Tokens consumed

Those of `Dialog`, `RadioGroupField`, `TextField`, `TextAreaField`, `CheckboxField`, `KeyChip`, `Button`, `Banner`; `radius.container`, `color.border.subtle`, `space.inset.md`, `space.stack.lg`, `space.stack.md`, `space.stack.sm`, `space.inline.xs`, `size.icon.md`.

## Code example

```tsx
<CloseDay state={state} view={briefing.todayView} onClose={close} save={actions.save} />
```

## Related components

- The focus item editor, Toast, `Badge` (the outcomes on Today).

## Do / Don't

- **Do** keep the outcome ids when editing a closed day.
- **Don't** default a row to Done because it was planned.

## Open questions

- Carrying items into tomorrow's plan. Today the next morning's draft does that, with Claude.

## Changelog

- 0.5.0: created.
