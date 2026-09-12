# HECATE MCP server

Lets a Claude session read HECATE workspace data directly, instead of that
context being re-explained by hand at the start of every session.

Reads and writes. Writes are **scoped verbs** — each one re-reads, changes one
path and writes back — rather than whole-file puts. Two writers rarely touch the
same path, so conflicts become unlikely by construction rather than something to
manage after the fact.

## Configuration

All config arrives as environment variables set by whichever MCP client spawns
the process — a stdio server has no localStorage to read credentials from. The
server refuses to start if any are missing, naming all of them at once.

| Variable | Meaning |
|---|---|
| `HECATE_GITHUB_TOKEN` | Fine-grained PAT. Needs **Contents: Read and Write** now that write verbs exist. |
| `HECATE_OWNER` | GitHub owner of the data repo. |
| `HECATE_REPO` | Data repo name (the private companion repo, not this one). |
| `HECATE_WORKSPACE` | Default workspace for tools that do not name one. |

The token can write to the data repo. Scope it to that repo only.

## Running it

```
npm run mcp
```

Or register it with a client. For Claude Code:

```
claude mcp add hecate \
  --env HECATE_GITHUB_TOKEN=ghp_… \
  --env HECATE_OWNER=… \
  --env HECATE_REPO=… \
  --env HECATE_WORKSPACE=… \
  -- npx tsx /absolute/path/to/HECATE/mcp/src/index.ts
```

Equivalent JSON config:

```json
{
  "mcpServers": {
    "hecate": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/HECATE/mcp/src/index.ts"],
      "env": {
        "HECATE_GITHUB_TOKEN": "ghp_…",
        "HECATE_OWNER": "…",
        "HECATE_REPO": "…",
        "HECATE_WORKSPACE": "…"
      }
    }
  }
}
```

## Tools

### Read

| Tool | What it does |
|---|---|
| `list_workspaces` | Workspace directories in the data repo, excluding archived (`_`-prefixed) and infrastructure ones. |
| `read_data_file` | One data file in full, migrated and validated. |
| `list_tasks` | Tasks flattened across columns, filterable by column type, tag, or title substring. |

### Write

| Tool | What it does |
|---|---|
| `add_task` | Create a task in a column (by name or id). |
| `update_task` | Change fields on a task; untouched fields are left alone. |
| `move_task` | Move a task between columns — this is how a task gets completed. |
| `update_focus_section` | Replace or append to a focus section's markdown. |
| `append_log_entry` | Append to a week log narrative field, defaulting to the most recent week. |

Lookup failures name what *was* available — a verb that says only "not found"
costs a session an extra round trip.

## How it fits together

```
index.ts        stdio transport — the only transport-aware file
  └ server.ts   builds the McpServer, registers tools (transport-agnostic)
      └ tools/  tool definitions, talking only to the StorageAdapter interface
          └ storage/  GitHubStorage today; the seam where git-JSON vs database gets decided
```

## Writes and conflicts

Verbs never see a SHA. They hand `mutateFile` a function that changes one path,
and the adapter owns the read-modify-write cycle:

1. Read the file (migrate, validate).
2. Apply the mutation in place.
3. Validate again — never PUT a shape the app would refuse to load.
4. PUT with the SHA that was read.

On a stale-SHA conflict the **whole cycle runs again against freshly read data**,
so a change that landed underneath us survives instead of being overwritten by a
stale copy. This is the concrete payoff of scoped verbs over whole-file writes,
and there is a test for exactly that. One retry, then `ConflictError` — no loops.

Because the mutation can run twice, it must be safe to re-run: IDs and
timestamps are generated *before* the call and captured in the closure, never
inside the mutation.

Three things are imported from the app rather than reimplemented, so the two
cannot drift: `schemas.ts` (the type contract), `migrate.ts` (the schema guard)
and `validate.ts` (structural checks). Reads go through exactly the same
migrate-then-validate path as the app's `loadFile`, which means the server
honours the forward-compatibility guard too — it refuses a file written by a
newer build rather than misreading it.

`src/lib/github.ts` is *not* shared: it reads credentials from `localStorage`
and decodes base64 via `atob`, both browser-shaped. `storage/github.ts` is the
Node counterpart.

## Notes

- Run via `tsx` rather than a compiled build. Fine for a locally-spawned stdio
  server, and it keeps this phase focused on the server's shape; switching to a
  compiled entry point later is a contained change.
- `stdout` is the MCP wire protocol. Diagnostics must go to `stderr` or they
  corrupt the stream.
