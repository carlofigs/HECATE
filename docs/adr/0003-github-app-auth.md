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

## Amendment — how it was built (Nov 2026, with `feat/worker-auth`)

Recorded when sign-in, `/api`, `/mcp` and `/hooks` were built in `apps/worker`.

- **One GitHub App does both jobs.** The App's own OAuth client signs the user
  in, so there is one registration in total. The user token it returns is used
  once to read `/user` and then dropped: it is never stored, and it carries no
  access to the data repo.
- **The allowlist is the numeric user id** (`ALLOWED_GITHUB_USER_ID`), because
  logins can be renamed. `/api` checks it on every request, and so does `/mcp`,
  so changing it shuts out sessions and tokens issued before the change.
- **The web session is stateless:** an HMAC-signed `__Host-` cookie (14 days,
  `SameSite=Strict`), with an Origin check on every write. Its key is derived
  from one `AUTH_SECRET`, as are the sign-in round-trip and remembered consent,
  so a token signed for one purpose is never accepted for another. Rotating
  `AUTH_SECRET` signs everyone out.
- **`/mcp` uses `@cloudflare/workers-oauth-provider` 1.x**, as one Worker
  holding both the authorization server and the resource. The library's
  helpers give the order MCP's security guidance requires:
  1. the client asks;
  2. the redirect URI must be https on an allowed host (`claude.ai`,
     `claude.com`, `MCP_REDIRECT_HOSTS`) or loopback;
  3. a consent page that can't be framed or forged;
  4. GitHub sign-in, with `state` and PKCE bound to the browser;
  5. the allowlist;
  6. the grant, carrying only the user's id and login.

  Consent can be remembered per client for 30 days. Clients can use dynamic
  registration (checked against the same redirect allowlist) or Client ID
  Metadata Documents (with `global_fetch_strictly_public`).
- **The push webhook** checks its signature over the raw body, then refreshes
  only the workspaces a push touched on the data branch. If the payload can't
  say (no commits, or GitHub's 20-commit cap), it refreshes them all.
- **Configuration is never half-applied.** Missing settings make the Worker
  answer 503 naming them (never their values). `/health` stays open.
