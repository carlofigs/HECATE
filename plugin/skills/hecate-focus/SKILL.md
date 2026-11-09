---
name: hecate-focus
description: "Draft or refresh the week's focus in HECATE, the user's planning system, through its MCP tools. Use when the user asks to update, refresh or draft their HECATE focus, \"what should I focus on this week\", \"plan the week\", or starts a sprint or returns from leave. Also for end-of-day wrap-ups in HECATE: \"I'm done for the day\", \"EOD update\", \"wrap up today\". Shows the proposed week exactly as it will read, and writes nothing until the user confirms."
---

# Focus drafter (HECATE)

Propose the week's focus from HECATE's state, show it exactly as the focus page will read, and write it only after the user confirms. Everything goes through the HECATE MCP tools. Never write local files.

---

## Step 1 — Workspace and current state

1. `list_workspaces`: use the workspace the user names, otherwise the default. If there are several and none is the default, ask which.
2. `get_briefing`. It gives:
   - today, and the sprint position (number, day n of m, the closing day);
   - this week's priorities, in progress, waiting on, blocked, due soon;
   - cutoffs and leave, keep in mind, and activity not yet seen.
3. `render_focus`: the current week as it stands. This is the baseline the change summary compares against.
4. `get_entity` with ref `workspace`. It gives the statuses, tags, working days and the **policy**: in a `sanitised` workspace, people are roles, never names.
5. For every project behind the tasks in progress or due soon, `get_entity` with ref `project:<slug>`:
   - hard deadlines;
   - the phase;
   - open questions with `blocker: true`;
   - the ordered next actions;
   - stakeholder cutoffs (e.g. "sign-off needed before they go on leave").
6. `find_tasks` as needed:
   - `{ scope: "board" }` for tasks finished in the last 7 days (for Last Week);
   - `{ urgency: "high" }`;
   - `{ kind: "waiting" }`.

### Sprint cycle

Never assume a cadence. The briefing's sprint position gives the sprint number, today's day in it and the day it closes. Use it to:

- assess urgency near the sprint's last day;
- tell in-sprint work from backlog;
- flag planning prep when the sprint closes this week.

A workspace without sprints has no sprint line. Skip the sprint reasoning.

### Calendar

Read the focus week's events (Monday to Sunday) through the calendar connector (for example Google Calendar). If no calendar is connected, say so and carry on: leave Today's meetings and Week at a Glance out rather than block the draft.

Each event becomes a schedule row:

| Field | Value |
|---|---|
| `date` | `YYYY-MM-DD` |
| `start`, `end` | `HH:MM`, 24-hour in the workspace's time zone. `null` for an all-day event |
| `title` | The event's name |
| `relevance` | `high` if the meeting is a gate, a hard dependency or needs prep. `med` if it is useful context. `null` if routine |
| `note` | One short phrase: the prep it needs, or why it matters (e.g. "A35 sign-off: primary gate") |
| `keys` | The tasks it maps to |
| `important` | `true` for the single most important meeting outcome of today, which renders in bold |

Personal events keep only their time slot: `personal: true` and nothing else, no title, note, relevance or keys. They render as "[Personal — blocked]". Never show a personal event's title or details anywhere.

Also:

- Sprint ceremonies: always flag planning `high` when tasks still need to get into the sprint.
- An async stand-up: note "BAU (async)".
- A meeting-free day: `low`, note "Best day for deep work".
- An optional social event: note "Optional social".

---

## Step 2 — Detect mode

- **Standard mode**: "update my focus", "refresh focus", "draft this week's focus", "plan the week", a new sprint, back from leave. Propose the whole week.
- **EOD mode**: "I'm done for the day", "EOD update", "give me my retrospective", "wrap up today". Run only Step 5's workflow.

---

## Step 3 — Standard mode: build one batch of ops

`weekOf` is the Monday of the focus week (`YYYY-MM-DD`). Draft for next week only when the user is planning a new week. A mid-week refresh keeps this week.

The focus page renders in this order:

1. Today;
2. the closed days, most recent first;
3. This Week's Priorities (callouts, then priorities);
4. Week at a Glance (working days only);
5. Last Week;
6. Waiting On;
7. Keep in Mind.

Each part comes from one op, apart from Waiting On:

| Part | Op | Rules |
|---|---|---|
| Today's meetings and Week at a Glance | `focus.setSchedule` `{ weekOf, rows }` | Replaces the week's schedule, so include every event of the week |
| Today's tasks | `focus.setPlan` `{ date: today, items: [{ lead, detail, keys, urgency }] }` | 2–4 concrete actions: the top 🎯 priority, anything that must happen today (a deadline, prep for today's main meeting, routine work due today) |
| Callouts | `focus.setCallouts` `{ weekOf, items: [{ lead, text, keys }] }` | Sprint ceremonies, major meetings, hard deadlines and cutoffs that shape the week |
| Priorities | `focus.setPriorities` `{ weekOf, items: [{ tier, lead, detail, keys }] }` | See below. At most about 7 |
| Last Week | `focus.setLastWeek` `{ weekOf, items: [{ text, keys }] }` | 3–5 bullets: what finished, what carried |
| Waiting On | none | Derived from open waiting (B) tasks. To change who or what a task waits on, `task.update` with `patch.waitingOn`; for a new dependency, `task.add` with `kind: "waiting"` |
| Keep in Mind | `keepInMind.add` / `keepInMind.update` / `keepInMind.remove` | The user's working memory: keep entries unless something contradicts them; add only a material new constraint |
| Closed days | `focus.closeDay` | Only for a working day since the last update that has a plan but no Done section. Mark every item 🔄 `carried` unless HECATE shows it finished (the task completed, the B task resolved). Never invent ✅ |

**Priorities.** Use project deadlines and sequences alongside task state:

- 🎯 `focus`: tasks in progress that are due this week or gate other work, and hard deadlines within 3 days.
- 🟡 `next`: in-progress tasks due later in the sprint, or the next to-do in a project's sequence.
- 🟢 `ongoing`: routine or low-urgency work worth a line.

Follow each project's next-action sequence, and flag a task that is in the sprint but gated by an earlier step not yet started.

Refer to tasks by key in `keys`. In prose, write "Title (A12)". Never invent priorities: everything comes from HECATE's state and the calendar.

---

## Step 4 — Present for confirmation

Call `apply_ops` with the ops and `dryRun: true`. Show:

1. **Proposed focus week**: the rendered week from the dry run, verbatim.
2. **Change summary**: a short list of what changed against the baseline, including:
   - new days, meetings or sections;
   - priorities added, dropped, promoted or demoted;
   - Waiting On changes;
   - keep-in-mind updates.
3. **Warnings** from the dry run, if any (a new tag, or a possible name in a sanitised workspace). Fix names to roles before asking.

End with: **"Write this to HECATE? Or adjust anything first?"**

Partial confirmation is fine ("write it but drop the last two 🟢 items"): change the ops. Dry-run again if the change is more than trivial.

## Step 4b — Write on confirmation

Call `apply_ops` with the same ops and:

- `dryRun: false`;
- the `ifVersion` the dry run reported;
- an `opId` (e.g. `focus-<date>-<n>`), so a retry is never applied twice.

If the version moved, read again and re-propose. Confirm with: "Focus updated — [brief summary]."

---

## Step 5 — EOD mode

Update today and what it touched. Never roll the week.

**A — Collect outcomes.** If the user gave outcomes ("A71 done, A45 still gated, dropped A59"), use them. Otherwise ask:

> "Before I wrap up today, what happened with your tasks? Run through each one briefly — done, deferred, or dropped — and I'll draft the Done section."

Do not continue without outcomes. Never invent ✅.

**B — Build one batch:**

- `focus.closeDay` `{ date: today, outcomes, note }`. Each outcome is `{ planItemId, result, lead, note, keys }`:
  - `result` is `done` ✅, `carried` 🔄 or `dropped` ❌;
  - take `planItemId` from today's plan (`get_entity` with ref `focus:<today>`);
  - something done that was not planned has no `planItemId`.
- `task.complete`, `task.drop` or `task.update` for every task the outcomes moved.
- `focus.setPriorities`, if anything was promoted, completed or unblocked.
- Waiting On changes (a new blocker as a waiting task; `task.complete` for a B task now resolved) and keep-in-mind changes.

**C — Present** with `dryRun: true`:

- the Done section;
- the revised priorities;
- what was added to or removed from Waiting On and Keep in Mind.

End with **"Write these changes to HECATE? Or adjust anything first?"**, then write as in Step 4b.

---

## Behavioural rules

- Never write without explicit confirmation. A dry run is not a write.
- Never invent priorities or completions: 🔄 is the safe default when an outcome is unknown.
- The calendar is supporting context. If it is missing, draft everything else and say so.
- Personal events never show a title or detail.
- Keep in Mind is the user's working memory. Don't prune it aggressively.
- If it is unclear which week the user means, ask before drafting.
- In a sanitised workspace, write roles ("the product manager"), never people's names, in every lead, note and detail.
