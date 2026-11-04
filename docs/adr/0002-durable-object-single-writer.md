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
- The calendar sync moves from a GitHub Action to a Worker Cron Trigger that
  goes through the same DO.

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
