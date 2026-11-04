# 0001 — Keep git as the data store, restructured

**Status:** Accepted (Nov 2026)

## Context

v1 stores seven JSON files per workspace in a private GitHub repo, written whole
through the Contents API. That gave ownership, free hosting, `git log` as an
audit trail and `git clone` as a backup. It also gave one commit per autosave, a
1 MB per-file ceiling, no multi-file atomicity, and whole-file conflicts. The
storage question was left open in v1 (`mcp/src/storage/types.ts`), with
Supabase as the main alternative.

Write volume is tiny: one user, a few dozen commits a month. Agents are the main
writers, and some of them (any Claude session with git access) can already
write by plain `git push`.

## Decision

Stay on git. Restructure the data so it suits it:

- split files that grow or change independently (one file per focus week, per
  project, per sprint; activity as weekly JSONL; references as real `.md`);
- write through the Git Data API (blobs → tree → commit → ref) so one logical
  change touching several files is one atomic commit;
- route every write through a single writer that coalesces commits (ADR 0002).

## Consequences

- No database to run, migrate, back up or keep awake. Nothing pauses after a
  week of inactivity, which matters for a tool that gets neglected.
- History, diff, blame and revert stay free.
- Querying is in-memory over parsed JSON. Fine at this scale (well under 1 MB
  per workspace); revisit if a workspace grows past a few MB.
- Realtime has to be built (Durable Object WebSockets, P6) rather than bought.

## Alternatives considered

| Option | Why not |
|---|---|
| Supabase Postgres | Row-level writes, realtime, SQL — but auth, RLS, migrations and type generation to maintain; the free tier pauses idle projects; git history would be replaced by an audit table; the calendar sync would need a rewrite. Overkill for one user. |
| Markdown files in git | Skills would work unchanged, but every structured UI edit becomes fragile parsing, and validation is impossible. |
