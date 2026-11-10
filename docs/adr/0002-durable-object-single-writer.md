# 0002 — One Durable Object per workspace is the only writer

**Status:** Accepted (Nov 2026)

## Context

v1 has several independent writers to the same files — the browser (whole-file
PUT on autosave), the MCP server (read-mutate-write with retry), the calendar
GitHub Action (plain `git push`) and Claude sessions pushing by hand. Each
handles conflicts differently, and the browser's 409 handling overwrote the
others. Dragging tasks produced about seven commits a minute; GitHub's secondary
limit on content-creating requests (roughly 80 a minute, several requests per
commit) makes that pattern unsafe at any scale.

`PATCH ref` with `force: false` only checks for a fast-forward; it does not
compare against the SHA the writer read. Two concurrent Worker isolates can
therefore still race unless something serialises them.

## Decision

Each workspace has one Durable Object, `WorkspaceDO`, that is the only thing
allowed to write to the data repo.

- It holds the authoritative state (DO SQLite), a monotonic `version`, a dedupe
  table of recent `opId`s, activity read cursors and a key index.
- App and MCP requests apply ops to that state synchronously and return the new
  version — read-your-writes for both.
- An alarm writes accumulated changes to git as one multi-file commit, at least
  30 s apart, with a flush on demand (`visibilitychange`, explicit save).
- If the ref update is rejected as non-fast-forward, the DO rebuilds the tree on
  the new head (`base_tree` + changed paths only), replays pending ops if any of
  those paths changed upstream, and retries up to three times with jitter.
- A GitHub push webhook tells the DO about external pushes so it refreshes.
- ~~The calendar sync moves from a GitHub Action to a Worker Cron Trigger that
  goes through the same DO.~~ Withdrawn: the calendar sync is retired instead
  ([ADR 0006](0006-retire-calendar-sync.md)).

## Consequences

- One conflict policy, in one place, covered by one set of tests.
- Commit volume is bounded regardless of how fast the UI emits changes.
- Requires Workers Paid (CPU headroom for parsing and validating JSON).
- The DO is a cache of git; losing it costs a cold re-read, never data.

## Alternatives considered

| Option | Why not |
|---|---|
| Ops replay on the server plus client-side rebase | Correct, but two conflict engines for a single user. The DO makes the client trivial. |
| Keep per-writer read-mutate-write (v1 MCP pattern) | Still races between isolates, still one commit per change. |

## Amendment — the engine (Nov 2026, with `feat/worker-do`)

Recorded when the Durable Object was built (`apps/worker/src/engine.ts`).

- **What it stores.** The workspace's files, one SQLite-backed storage key per
  file, plus `version`, the commit they match, the pending batches and the
  last 500 opIds with their results. Parsed state is rebuilt from the files on
  wake, so storage holds exactly what git will.
- **Coalescing.** The first pending change sets the alarm one interval (30 s)
  out, and every change applied before it fires joins that commit. Commits are
  therefore at least an interval apart, and 20 ops in a minute make at most
  two. `flush()` commits at once.
- **Rebuild or replay.** After a rejected ref update the engine reads the new
  head:
  - If none of its pending paths changed upstream, and the merged files still
    load and pass `checkWorkspace`, it rebuilds the commit on the new head.
  - Otherwise it replays its pending batches on the upstream state, in order.
- **What a replay can change.**
  - Keys allocated by a batch that is not yet committed can change if
    upstream took them first (`$1` was A3 and becomes A4).
  - A batch that no longer applies is dropped.
  - Both are reported in the flush result and in the snapshot's
    `lastReplay`, and stored against the opId: a retry of a renumbered batch
    returns its final keys, and a retry of a dropped one is refused.
- **A broken head is never adopted.** A head that does not load and check
  clean is not taken up, whether it arrives by refresh or by conflict.
  Pending changes are kept, the error is reported, and the commit is retried a
  minute later. Replaying onto it would only drop every pending change.
- **Freshness.** A read checks the branch head if the last check is more than
  30 s old. The check is conditional, so an unchanged head costs nothing
  against the rate limit. The push webhook (with `feat/worker-auth`) makes
  this immediate.
- **Testing.** The engine is platform-neutral: storage, the alarm and GitHub
  are injected. It is tested in Node against the fake GitHub, and the Worker
  runs end to end in workerd through Miniflare. Cloudflare's Vitest pool is
  not used because it does not support Vitest 5 yet.

## Amendment — a sprint close is its own commit (Nov 2026, with `feat/web-sprint`)

P5's acceptance asks that closing a sprint be one commit that `git revert`
undoes. Coalescing would otherwise fold a close into whatever else the 30 s
window gathered, and reverting that commit would undo unrelated edits too.

- **The rule.** When a batch that is not a dry run contains `sprint.close`,
  the engine commits everything pending first. It then applies the batch and
  commits it at once instead of waiting for the alarm. The commit's message is
  the close's own summary.
- **Why only the close.** It is the one op that moves many tasks between files
  (`tasks.json` to `sprints/<n>.json`) and that no other op undoes. Everything
  else stays coalesced.
- **The limit.** Commits still go through `flush()`. If GitHub is unavailable,
  the close waits with the usual retries, and a change applied in the meantime
  joins its commit. The close itself is never lost or split.
