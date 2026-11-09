---
name: hecate-meeting
description: "Process a meeting into HECATE, the user's planning system, through its MCP tools: a structured meeting summary, proposed tasks (A for the user's own actions, B for what they wait on), new people and terms, and the meeting saved — all proposed as a dry run and written only on confirmation. Use when the user asks to process a meeting, transcript, notes or KT session into HECATE, \"extract actions from\" one, or \"update HECATE from this meeting\"."
---

# Meeting → HECATE

Turn meeting input into a structured summary and a set of proposed changes to HECATE. Write nothing until the user confirms.

---

## Overview

1. Read the meeting input.
2. Produce a structured meeting summary.
3. Propose tasks, people and terms as ops, and dry-run them to get the new keys.
4. Present everything for confirmation.
5. On confirmation, apply: the tasks, people and terms, the meeting itself (open workspaces only), and one activity entry.

**Never write without explicit confirmation.**

---

## Step 1 — Workspace and context

1. `list_workspaces`: the workspace the user names, otherwise the default.
2. `get_entity` with ref `workspace`. It gives the **policy**, the tags (the only tag vocabulary to use) and the statuses.
3. `get_entity` with ref `profile`. It says who the user is, so their actions are A tasks.
4. `search` for the projects, people and terms the meeting mentions, and `find_tasks` for existing tasks it touches. `get_entity` opens any of them in full.

**Sanitised workspace:** people are roles ("the product manager"), never names, in the summary you store, the tasks, the people records and the notes. The meeting itself is **not** saved (HECATE refuses meeting notes there); the summary stays in this chat. Say so in the proposal.

---

## Step 2 — Read the input

The input is pasted text or attached files. In Cowork or Claude Code it can be a folder the user names; read only what they point at.

- **.md / .txt**: read directly.
- **.pdf**: extract the text, e.g. `pdfminer.high_level.extract_text()` (install `pdfminer.six` if needed).
- **.docx**: extract the text, e.g. `docx.Document().paragraphs` (install `python-docx` if needed).
- **.xlsx**: treat as tabular notes (`openpyxl`).

If a file can't be read, say which and ask the user to paste it.

---

## Step 3 — Detect the input type

- **Full transcript**: verbatim, with speaker labels or timestamps.
- **Partial or async notes**: bullets, a chat summary, a forwarded update. Flag incomplete sections rather than leaving them out.
- **Multi-source**: two or more summaries of the same meeting.
  - Content in both sources: include it without a flag.
  - Content in one source only: include it, marked `[single source]`.
  - Conflicting content: show both versions, flagged `[sources conflict — verify]`.
  - Never resolve a conflict silently.

---

## Step 4 — The meeting summary

Use `##` for the title, `###` for each section and `####` for next steps. Section names are always headings, never plain text. The title has no emoji: `## Meeting Summary — [Meeting Name] ([Date])`.

### 📋 Session Overview
One short paragraph of prose: what the meeting was about, who was involved, and the main outcome or decision.

### 📊 Key Data Points & Metrics
| Metric / Finding | Value | Context |
|---|---|---|

Every number, percentage, threshold or finding. The Context column is mandatory: what the number refers to and why it matters.

### ⚙️ Technical Decisions
| Decision | Status | Notes |
|---|---|---|

Status is either Confirmed or Under discussion.

### ✅ Action Items
| # | Action | Owner | Deadline | Urgency |
|---|---|---|---|---|

- Owner is "Unassigned" if no one was named; never infer one. Deadline is "TBC" if none was given.
- Urgency:
  - 🔴 High: it gates something or is overdue;
  - 🟡 Medium: a near deadline, or in the sprint;
  - 🟢 Low: backlog or informational.
- Sort by urgency (🔴 first), then the user's own actions first within each band, then the soonest deadline.

### ❓ Open Questions & Risks
| Question / Risk | Owner | Notes |
|---|---|---|

Put metrics that lack the context to interpret them here, rather than guessing.

### 🔜 Next Steps
One `####` subheader per step. Under each, the context, dependency or nuance, as prose or a short list, whichever reads best.

### 📝 Notes for Review
2–5 bullets: caveats, ambiguities, decisions that may need revisiting, or effects on other work.

Whenever an existing task is mentioned anywhere, write it as **"Task Name (A35)"**, never a bare key.

---

## Step 5 — Build the ops

**Tasks.** One `task.add` per action item worth tracking, each with its own `ref` (`"$1"`, `"$2"` …) so other ops can refer to it:

- **The user's own actions:** `kind: "action"` (an A key), `status` the first to-do status.
- **What the user waits on from others:** `kind: "waiting"` (a B key) with a `waitingOn`:
  - in an open workspace, `{ personId }` for someone known, or `{ text: "Name or team" }`;
  - in a sanitised workspace, `{ text: "<role>" }`.
  - Never leave it as a generic "external dependency".
- **The other fields:**
  - `title`: verb-led, specific.
  - `note`: the detail.
  - `urgency`: `high`, `med` or `low`.
  - `tags`: from the workspace's tags. A new tag is added automatically, and the dry run says so.
  - `project`: the project slug.
  - `due`: if a deadline was given.
- To link to existing work, use `dependsOn` with keys or `$n` placeholders.

**People and terms:**

- `person.upsert` for each new person: `role`, and `notes` on what they own. Use `[role not stated]` if the role is unclear; never guess. In an open workspace add `name` and any `aliases`; in a sanitised one, the role only.
- `person.upsert` with `id` to update someone already recorded.
- `term.upsert` for each new acronym, project name or concept, or to update an existing one.

**The meeting.** In an open workspace only, `meeting.save` with:

- `date`, a kebab-case `slug`, `title`;
- `input` (`transcript`, `notes` or `multi-source`), `sources`, `conflicts` (the count);
- `people` (person ids), `projects` (slugs), `keys` (the `$n` refs and existing keys);
- `body`: the full summary from Step 4.

**The log.** One `activity.log` with:

- `entry: "session"`, `area: "meeting"`;
- `delta`: "[Meeting] processed — $1, $2 added; [decision]";
- `pointers: ["meeting:<date>-<slug>"]`;
- `keys`.

Call `apply_ops` with `dryRun: true`. The preview lists every change, the **new keys** each `$n` would get, and any warnings, such as a possible name in a sanitised workspace. Fix names to roles and dry-run again.

---

## Step 6 — Present for confirmation

Begin directly with the summary: no stage labels or processing notes at the top.

---
## Meeting Summary — [Meeting Name] ([Date])
[the seven sections]

---
## ✅ Proposed tasks

| Key | Task | Kind | Status | Tags | Urgency | Waiting on |
|---|---|---|---|---|---|---|
| A49 (new) | … | action | To Do | #… | 🔴 High | — |

The keys come from the dry run's "New keys". They are final once applied, unless someone else adds a task first.

---
## 🧠 Proposed people and terms

**New people:**

| Name or role | Role / what they own |
|---|---|

**New terms:**

| Term | Meaning |
|---|---|

**Updates to existing entries:** one block per entry:

| | |
|---|---|
| **Entry** | … |
| **Current** | … |
| **Proposed** | … |
| **Reason** | … |

---

**Write these changes to HECATE? Or adjust anything first?**

---
## 📎 Processing Summary

| | |
|-|-|
| Input | [file name or "pasted"] |
| Input type | Full transcript / Partial notes / Multi-source |
| Sources | [list, if multi-source] |
| Conflicts detected | [count, or None] |
| New people flagged | [count] |
| New terms flagged | [count] |
| Meeting saved | Yes / No — sanitised workspace |

Partial confirmation is fine ("tasks only, skip people"): drop the ops that don't apply, then dry-run again.

---

## Step 7 — Write on confirmation

Call `apply_ops` with the confirmed ops and:

- `dryRun: false`;
- the dry run's `ifVersion`;
- an `opId` (e.g. `meeting-<date>-<slug>`), so a retry is never applied twice.

Then confirm briefly: the keys added, the people and terms recorded, and whether the meeting was saved.

---

## Behavioural rules

- Never write without explicit confirmation.
- Never infer task owners.
- Show tasks and records as tables, never as raw ops or JSON.
- If the meeting contradicts something HECATE holds, flag it and ask which version stands.
- Multi-source conflicts are always surfaced, never resolved silently.
- In a sanitised workspace: roles only, and no meeting notes stored.
- The processing summary always goes last.
