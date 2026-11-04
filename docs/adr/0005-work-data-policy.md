# 0005 — Per-workspace `open` / `sanitised` data policy

**Status:** Accepted (Nov 2026)

## Context

HECATE becomes the single source of truth for planning, including for work.
The data repo and the Worker are personal infrastructure, not the employer's.
Work-side practice is that colleagues are referred to by role and work
documents stay on the work side; the existing work Focus pages already follow
this by hand.

## Decision

Each workspace declares `policy: "open" | "sanitised"` in `workspace.json`.

In a **sanitised** workspace:

- tasks, keys, statuses, priorities, focus and projects are stored as normal,
  with prose written in roles ("the product manager"), not names;
- `people.json` entries carry a `role` and no `name`; ops that set a name are
  rejected;
- `meeting.save` is rejected — meeting summaries stay on the work side;
- `apply_ops` dry runs return `warnings[]` for text that looks like a personal
  name, so the skill can rephrase before confirming.

**Open** workspaces (personal and side projects) have no restriction.

## Consequences

- Work planning lives in HECATE without moving work documents or colleague
  names into personal infrastructure.
- Name detection is a heuristic and only warns. The real guarantee is the
  skills: they read the policy through `get_briefing` and write roles.

## Alternatives considered

| Option | Why not |
|---|---|
| Full work data | Moves colleague names and meeting content into personal infrastructure. |
| Personal workspaces only | Leaves work planning — the heaviest use — outside the single source of truth. |
