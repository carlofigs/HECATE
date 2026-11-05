---
name: hecate-log
description: "Record session progress in HECATE's activity log, the user's planning system, through its MCP tools, so the next session (or the app) picks up what changed. Use when the user says \"log update\", \"flag this\", \"log this now\", \"wrap up session\", \"log session updates\" or \"close session\" while working with HECATE. Two modes: Flag (one immediate entry) and Close (an end-of-session summary of every material change)."
---

# Update logger (HECATE)

Add entries to the workspace's activity log, so the next session sees what changed without re-reading everything. `get_briefing` and `get_activity` show each entry to the next session until it is acknowledged.

---

## Step 1 — Workspace and vocabulary

1. `list_workspaces`: the workspace the user names, otherwise the default.
2. `get_entity` with ref `workspace`. Its **areas** are the activity areas (e.g. `bau`, `admin`, `meeting`). Prefer an existing area. A new one is added automatically, so use one only when nothing fits.

---

## Step 2 — Detect mode

- **Flag mode**: "flag this", "log this now", "immediate update", or anything time-sensitive that should not wait for the end of the session. Write **one** entry for that item, with `entry: "flag"`.
- **Close mode**: "wrap up session", "log session updates", "close session", "log updates", or end-of-session phrasing. Review the whole session, and write one `entry: "session"` line per material change.

---

## Step 3 — What clears the bar

| Log it | Do not log it |
|---|---|
| A task completed | Exploratory work with no task output |
| A new task (A or B) | Reading without changing anything |
| A task blocked or unblocked | Minor edits to a task's note or date |
| A confirmed decision (method, scope, approach) | Work in progress with no output yet |
| A new hard deadline or leave cutoff | |
| A blocker added or cleared | |
| A meeting processed (one entry is enough; point at the meeting) | |

**Flag immediately** anything that:

- changes the critical path;
- creates or removes a hard deadline;
- locks in a method decision.

HECATE already records system events (a task completed, a sprint closed) by itself. Log what those events don't say: the why, the decision, the consequence.

---

## Step 4 — Write the entries

One `activity.log` op per entry:

| Field | What goes in it |
|---|---|
| `entry` | `"flag"` or `"session"` |
| `area` | An area from Step 1 |
| `delta` | Verb-led and specific, under about 120 characters (200 at most). Not "worked on A71" but "A71 prod run started; B36 still blocking full validation" |
| `pointers` | Where the detail lives, e.g. `meeting:2026-03-30-delivery-check-in`, `project:scorecard` |
| `keys` | The task keys the entry is about |

Send them in one `apply_ops` call with `dryRun: false` and an `opId` (e.g. `log-<date>-<n>`). The user's request is the confirmation.

---

## Step 5 — Confirm

> Logged [n] entries:
> - [one line per entry]

If nothing in the session clears the bar, say so: "Nothing in this session clears the log bar — no entries written." Never write a placeholder entry.

---

## Behavioural rules

- When unsure whether something clears the bar, log it. The next session can skip a low-value entry, but it cannot recover a missing one.
- The log is append-only: never try to change or remove an entry.
- In a sanitised workspace, write roles, never people's names.
