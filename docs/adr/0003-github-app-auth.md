# 0003 — GitHub App for storage, GitHub login for identity only

**Status:** Accepted (Nov 2026)

## Context

v1 keeps a personal access token in `localStorage`. Every Pages site under the
same `*.github.io` account shares that origin, so any of them could read it. The
MCP server takes a PAT in its environment. v2's MCP becomes a remote connector
(claude.ai web and mobile, Cowork, Claude Code), which needs OAuth.

## Decision

- **Storage:** a GitHub App, installed only on the data repo with
  `contents: read & write`. The Worker mints short-lived installation tokens
  from the App's private key (a Worker secret). No user token is stored.
- **Identity:** "Sign in with GitHub" only establishes who the caller is. The
  Worker accepts exactly one GitHub user id (allowlist) and returns 403 for
  anyone else.
- **Web app:** `/api/*` uses an httpOnly, `SameSite=Strict` session cookie plus
  an Origin check. No token ever reaches browser JavaScript.
- **MCP:** `/mcp` accepts bearer tokens only, issued by
  `@cloudflare/workers-oauth-provider` with GitHub as the upstream identity
  provider — dynamic client registration for claude.ai, a `redirect_uri`
  allowlist, and a consent page with CSRF state. The cookie is never accepted
  on `/mcp`.
- Preview and production are separate Workers, so a broken preview deploy
  cannot take down the connector Claude depends on.

## Consequences

- Revoking access is uninstalling the App; nothing to rotate in browsers.
- The App can reach only the data repo, unlike an OAuth App's `repo` scope.
- One more piece of setup (App registration, private key secret) for anyone
  self-hosting.

## Alternatives considered

| Option | Why not |
|---|---|
| OAuth App user tokens | `repo` scope covers every private repo the user can see. |
| GitHub App user-to-server tokens stored in KV | 8-hour tokens with rotating refresh tokens; concurrent refreshes can invalidate each other; more secrets at rest. |
| Keep the PAT | Shared origin exposure; no path to a remote connector. |
