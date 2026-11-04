# 0006 — Retire the calendar sync; skills read the calendar directly

**Status:** Accepted (Nov 2026) · Withdraws the Cron Trigger bullet in
[0002](0002-durable-object-single-writer.md)

## Context

v1 mirrored Google Calendar into the data repo: a scheduled GitHub Action in
the data repo refreshed `calendarEvents` inside each synced workspace's
`focus.json` every two hours on weekdays. The v2 roadmap planned to move that
job to a Worker Cron Trigger.

In practice:

- It only ever reached personal calendars. The work calendar sits behind an
  employer account the Action cannot authenticate to, so work Week at a Glance
  sections were already written by hand or by Claude.
- It depended on a long-lived Google OAuth refresh token stored as a secret.
  In late October 2026 Google started rejecting that token (`invalid_grant`),
  every run failed, and the workflow was disabled — without anything else
  breaking, which says how little the mirror was relied on.
- It was the one writer that committed on a schedule, so it was the most
  frequent source of conflicts with the app's own saves.
- Claude now reads calendars directly through its Google Calendar connector
  (and the work equivalent where available), at the moment it drafts a focus
  week or a morning brief.

## Decision

v2 does not mirror calendars into the data repo.

- No `calendar/events.json`, no Worker Cron Trigger, no Google OAuth secrets.
- Skills that need the calendar (the focus drafter, the morning brief) read it
  through the calendar connector when they run, and write what matters —
  Week at a Glance rows with their relevance notes — into the focus week
  through `apply_ops`, like any other change.
- Personal events are summarised as `[Personal — blocked]` by the skill before
  anything is written, so personal details never enter the data repo.
- The v1 workflow stays disabled. At cutover its workflow file and scripts are
  deleted from the data repo; `migrate-v1` drops stored `calendarEvents`.

## Consequences

- One fewer secret to keep alive, and one fewer scheduled writer.
- The calendar in HECATE is a snapshot taken when a skill last drafted the
  week, not a live feed. That matches how it was used: the week is planned
  from the calendar, and the plan is what HECATE holds.
- The v1 app's calendar view shows no new events. It has shown none since the
  token failed, and v1 is frozen.
- If a live calendar view is ever wanted in the v2 UI, it should read the
  calendar at view time rather than revive a mirror in git.

## Alternatives considered

| Option | Why not |
|---|---|
| Revive the Action (new token, OAuth app moved to production status) | Keeps a secret and a scheduled writer alive for a personal-only feed that went unnoticed when it broke. |
| Move the sync to a Worker Cron Trigger (the original plan) | Same secret and same snapshot, plus more Worker code to own. |
