# Deploying HECATE v2

How to stand up the v2 Worker, connect Claude to it, and keep it running.
Decisions behind it: ADR 0001–0003 and 0008. Nothing personal belongs in this
repository. Account ids, URLs and secrets live in Cloudflare and GitHub
settings, never in a committed file.

## Overview

| Piece | Where | What it is |
|---|---|---|
| Worker `hecate-preview` | Cloudflare | v2 during beta: reads and writes the data repo's **`v2` branch** |
| Worker `hecate` | Cloudflare | v2 from cutover: the data repo's `main` |
| `WorkspaceDO` | inside each Worker | One Durable Object per workspace, the only writer (ADR 0002) |
| `OAUTH_KV` | inside each Worker | MCP clients, grants and token hashes; provisioned on first deploy |
| GitHub App | your GitHub account | Storage (contents on the data repo only), sign-in, and the push webhook (ADR 0003) |
| `.github/workflows/worker.yml` | this repo | Deploys preview on every merge that touches the Worker; production by hand |

The two Workers are separate, so a broken preview never takes down the
connector Claude relies on. During beta only preview exists, and v1 keeps
working on `main` untouched.

## One-time setup

Each step takes a few minutes. Do them in order: later steps need values from
earlier ones.

### 1. Cloudflare

1. Create a Cloudflare account and choose a workers.dev subdomain.
2. Subscribe to **Workers Paid** (about US$5/month). Parsing and validating a
   workspace needs more CPU than the free plan allows (ADR 0002).
3. Create an API token: **My Profile → API Tokens → Create Token → "Edit
   Cloudflare Workers"** template, limited to your account. It covers Workers
   scripts, KV and Durable Objects.
4. In this GitHub repository, open **Settings → Secrets and variables → Actions**
   and add two secrets:
   - `CLOUDFLARE_API_TOKEN`: the token.
   - `CLOUDFLARE_ACCOUNT_ID`: from the Workers overview page.

### 2. First deploy (to learn the URL)

Run **Actions → Deploy Worker → Run workflow → preview**. The Worker deploys
and answers `503 Not configured` until step 4, which is expected. Its URL is
`https://hecate-preview.<subdomain>.workers.dev`; this is `PUBLIC_URL` below.
Save it as the repository variable `HECATE_PREVIEW_URL`, which turns on the
post-deploy smoke check.

### 3. The GitHub App

Open **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.

| Field | Value |
|---|---|
| Name | Anything unique, e.g. "HECATE for <you>" |
| Homepage URL | `PUBLIC_URL` |
| Callback URLs | `PUBLIC_URL/oauth/github/callback` **and** `PUBLIC_URL/auth/callback` |
| Expire user authorization tokens | On (the default) |
| Request user authorization (OAuth) during installation | **Off** |
| Device flow | Off |
| Webhook | Active. URL `PUBLIC_URL/hooks/github`. Secret: a random string (keep it for step 4) |
| Repository permissions | **Contents: Read and write**. Metadata: Read-only (automatic). Nothing else |
| Account permissions | None |
| Subscribe to events | **Push** |
| Where can it be installed | Only on this account |

After creating it:

- Note the **App ID** and the **Client ID**.
- **Generate a client secret** and keep it.
- **Generate a private key**, which downloads a `.pem` file. Keep it outside
  every repository.
- **Install App → Only select repositories →** the data repo, and nothing else.

### 4. Worker secrets

All of these are Worker secrets: deploys never touch them, and none is
committed.

| Secret | Value |
|---|---|
| `PUBLIC_URL` | From step 2 |
| `GITHUB_OWNER`, `GITHUB_REPO` | The data repository's owner and name |
| `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From step 3 |
| `GITHUB_APP_PRIVATE_KEY` | The `.pem` from step 3 (PKCS#1 is fine) |
| `ALLOWED_GITHUB_USER_ID` | Your numeric GitHub id (see below) |
| `AUTH_SECRET` | 32+ random characters; signs sessions and remembered consent |
| `GITHUB_WEBHOOK_SECRET` | The webhook secret from step 3 |

Two settings are optional:

- `DEFAULT_WORKSPACE`: the workspace a tool uses when none is named. If it is
  unset, the only visible workspace is the default.
- `MCP_REDIRECT_HOSTS`: replaces the default `claude.ai,claude.com`.

Your numeric id (`/user` with your own token):

```bash
gh api user --jq .id
```

Two random secrets:

```bash
openssl rand -base64 48
```

```bash
openssl rand -hex 32
```

Put the plain values in a JSON file **outside every repository**, upload them
in one go, then delete the file:

```bash
pnpm --filter @hecate/worker exec wrangler secret bulk /path/outside/repos/hecate-preview-secrets.json --env preview
```

The private key goes in on its own, from the `.pem`:

```bash
pnpm --filter @hecate/worker exec wrangler secret put GITHUB_APP_PRIVATE_KEY --env preview < /path/outside/repos/hecate.private-key.pem
```

Then check the Worker from outside:

```bash
pnpm --filter @hecate/worker smoke https://hecate-preview.<subdomain>.workers.dev
```

Every line should say `ok`. A `not configured` line names the missing secrets.

### 5. The `v2` data branch

The Worker reads the data repo's `v2` branch, made by `migrate-v1` from the
current v1 data (ADR 0008). The settings v1 never stored (names, time zones,
policies, sprint cadences, extra name → role replacements) live in a private
config. Keep it in the data repo (for example `scripts/migrate-config.json`)
or on your machine, never here.

1. Dry-run the migration, and for sanitised workspaces review the leftover-name
   candidates. Add any real names to the config's `replacements` and run again.

   ```bash
   pnpm migrate-v1 --data /path/to/data-repo --config /path/to/migrate-config.json --names
   ```

2. When every workspace reports **Ready**, write the trees:

   ```bash
   pnpm migrate-v1 --data /path/to/data-repo --config /path/to/migrate-config.json --out /tmp/hecate-v2
   ```

3. In the data repo, create `v2` from `main`. Replace each workspace directory
   with its migrated tree, leave everything else as it is, commit and push.
   Scheduled workflows only run on the default branch, so pushing `v2`
   triggers nothing.

### 6. Connect Claude

| Client | How |
|---|---|
| claude.ai (web, desktop, mobile) | Settings → Connectors → **Add custom connector**: name "HECATE", URL `PUBLIC_URL/mcp`. Connect, then Allow on the HECATE page, then sign in with GitHub |
| Claude Code | `claude mcp add --transport http hecate PUBLIC_URL/mcp`, then `/mcp` to sign in |
| MCP Inspector | `npx @modelcontextprotocol/inspector`, Streamable HTTP, URL `PUBLIC_URL/mcp` (its localhost callback is allowed) |

The consent page shows where access will be sent. Tick "Don't ask again" to
skip it for that client for 30 days.

## Acceptance (P2)

| Check | How | Also proven by |
|---|---|---|
| MCP Inspector lists the tools | Inspector → List Tools: nine tools | `test/mcp.test.ts` |
| claude.ai authenticates; `get_briefing` works on `v2` | Ask Claude in claude.ai for your HECATE briefing | `test/auth.e2e.test.ts` |
| 20 ops in 60 s make at most 2 commits | Ask Claude for twenty small changes in a minute; `git log origin/v2` shows at most two new commits | `test/engine.test.ts` |
| Concurrent app and MCP ops both survive | Two sessions changing the same workspace at once; both changes are in git | `test/engine.test.ts` (rebuild and replay) |
| An external push shows within 10 s | Push a small change to `v2` by hand; ask for the briefing | `test/auth.e2e.test.ts` (webhook) |
| A non-allowlisted user gets 403 | `PUBLIC_URL/auth/login` with another GitHub account → "Not allowed" | `test/auth.e2e.test.ts` |
| Smoke | `pnpm --filter @hecate/worker smoke PUBLIC_URL` | `test/smoke.test.ts` |

## Operations

| Task | How |
|---|---|
| Live logs | `pnpm --filter @hecate/worker exec wrangler tail --env preview` |
| Redeploy | Actions → Deploy Worker → Run workflow |
| Rotate `AUTH_SECRET` | Put a new value. Everyone is signed out of the web app, and remembered consent is forgotten |
| Rotate the App key | App settings → generate a new key → put `GITHUB_APP_PRIVATE_KEY` → delete the old key |
| Shut out MCP access | Disconnect the connector in claude.ai; to cut off every token at once, change `ALLOWED_GITHUB_USER_ID` (checked on every call) |
| Cut off data access | Suspend or uninstall the GitHub App. The Worker can no longer read or write the data repo |
| Something looks stuck | `get_briefing` and the snapshot report `lastError`. A head that does not load is never adopted: fix the data repo by hand and the pending commit goes through |

## Limitations

- The Durable Object is a cache of git. Losing it costs a cold re-read from the
  branch, never data, but uncommitted changes from the last 30 s would be lost
  with it. `flush` commits at once.
- Sanitising is by known names (ADR 0005, 0008). Prose can still mention
  someone memory never recorded. The `--names` review is the safeguard.
- Production is deployed by hand, and only at cutover, when the migration
  reruns onto `main` (ROADMAP: Migration and cutover).
