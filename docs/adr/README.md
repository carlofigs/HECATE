# Architecture decision records

One file per decision, numbered in order and never renumbered. A superseded
record stays, with its status changed and a link to the record that replaces it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-storage-git.md) | Keep git as the data store, restructured | Accepted |
| [0002](0002-durable-object-single-writer.md) | One Durable Object per workspace is the only writer | Accepted |
| [0003](0003-github-app-auth.md) | GitHub App for storage, GitHub login for identity only | Accepted |
| [0004](0004-ops-model.md) | All changes are idempotent, relative ops | Accepted |
| [0005](0005-work-data-policy.md) | Per-workspace `open` / `sanitised` data policy | Accepted |
| [0006](0006-retire-calendar-sync.md) | Retire the calendar sync; skills read the calendar directly | Accepted |
| [0007](0007-strict-versioned-schemas-and-ab-keys.md) | Strict, versioned file schemas; A/B task keys everywhere | Accepted |
| [0008](0008-migrating-v1-data.md) | Migrating v1 data: direct files, kept keys, legacy sprints, names to roles | Accepted |
| [0009](0009-offline-copy.md) | A copy of HECATE on the device: snapshots and unsent changes in IndexedDB, cleared at sign-out | Accepted |

Template: **Status · Context · Decision · Consequences · Alternatives considered.**
