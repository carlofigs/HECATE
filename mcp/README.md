# HECATE MCP server

Lets a Claude session read HECATE workspace data directly, instead of that
context being re-explained by hand at the start of every session.

**Phase 1 is read-only.** Nothing here can modify the data repo. Scoped write
verbs (`add_task`, `append_log_entry`, …) come next.

## Configuration

All config arrives as environment variables set by whichever MCP client spawns
the process — a stdio server has no localStorage to read credentials from. The
server refuses to start if any are missing, naming all of them at once.

| Variable | Meaning |
|---|---|
| `HECATE_GITHUB_TOKEN` | Fine-grained PAT. **Contents: Read** is sufficient for this phase. |
| `HECATE_OWNER` | GitHub owner of the data repo. |
| `HECATE_REPO` | Data repo name (the private companion repo, not this one). |
| `HECATE_WORKSPACE` | Default workspace for tools that do not name one. |

Give the token read-only scope until the write phase actually needs more.

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

| Tool | What it does |
|---|---|
| `list_workspaces` | Workspace directories in the data repo, excluding archived (`_`-prefixed) and infrastructure ones. |
| `read_data_file` | One data file in full, migrated and validated. |
| `list_tasks` | Tasks flattened across columns, filterable by column type, tag, or title substring. |

## How it fits together

```
index.ts        stdio transport — the only transport-aware file
  └ server.ts   builds the McpServer, registers tools (transport-agnostic)
      └ tools/  tool definitions, talking only to the StorageAdapter interface
          └ storage/  GitHubStorage today; the seam where git-JSON vs database gets decided
```

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
