/**
 * The HECATE v2 Worker (ADR 0003).
 *
 * - /mcp: HECATE's MCP tools (mcp/server.ts), behind bearer tokens issued by
 *   @cloudflare/workers-oauth-provider, which also serves discovery,
 *   /oauth/token and /oauth/register.
 * - /authorize, /oauth/github/callback: connecting an MCP client.
 * - /auth/*, /api/*: the web app's GitHub sign-in and its cookie-session API.
 * - /hooks/github: the data repository's signed push webhook.
 * - /health.
 *
 * The provider's resource metadata names this Worker's public URL, so it is
 * built from the environment on first use (one per isolate).
 */

import { OAuthProvider, getOAuthApi, type OAuthProviderOptions } from '@cloudflare/workers-oauth-provider'
import { authSettings, type AuthSettings } from './auth/config.ts'
import { messagePage } from './auth/pages.ts'
import { redirectAllowed } from './auth/redirects.ts'
import { storeFor, type Env } from './env.ts'
import { handleApi } from './routes/api.ts'
import { authorize, githubCallback } from './routes/authorize.ts'
import { githubHook } from './routes/hooks.ts'
import { mcpApiHandler } from './routes/mcp.ts'
import { callback, login, logout } from './routes/web-auth.ts'
import type { WorkspaceRpc } from './routes/workspace-rpc.ts'
import { WorkspaceList } from './workspaces.ts'

export { WorkspaceDO } from './workspace-do.ts'

const DAY = 24 * 60 * 60

interface Shared {
  key: string
  provider: OAuthProvider<Env>
  options: OAuthProviderOptions<Env>
  workspaces: WorkspaceList
}

let shared: Shared | null = null

function current(): Shared {
  if (!shared) throw new Error('The Worker is not initialised')
  return shared
}

function workspaceRpc(env: Env, dir: string): WorkspaceRpc {
  return env.WORKSPACE.get(env.WORKSPACE.idFromName(dir))
}

async function route(request: Request, env: Env, ctx: ExecutionContext, settings: AuthSettings): Promise<Response> {
  const state = current()
  const path = new URL(request.url).pathname
  const oauth = getOAuthApi(state.options, env)
  const workspace = (dir: string): WorkspaceRpc => workspaceRpc(env, dir)

  if (path === '/authorize') return authorize(request, { oauth, settings })
  if (path === '/oauth/github/callback') return githubCallback(request, { oauth, settings })
  if (path === '/auth/login') return login(request, { settings })
  if (path === '/auth/callback') return callback(request, { settings })
  if (path === '/auth/logout') return logout(request, { settings })
  if (path === '/api' || path.startsWith('/api/')) {
    return handleApi(request, { settings, workspaces: state.workspaces, workspace, defaultWorkspace: env.DEFAULT_WORKSPACE || null })
  }
  if (path === '/hooks/github') {
    return githubHook(request, {
      secret: settings.webhookSecret, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH,
      workspaces: state.workspaces, workspace, waitUntil: p => ctx.waitUntil(p),
    })
  }
  return messagePage('Not found', 'Nothing lives here.', 404)
}

function providerOptions(settings: AuthSettings): OAuthProviderOptions<Env> {
  return {
    apiRoute: '/mcp',
    apiHandler: mcpApiHandler<Env>(env => ({
      listWorkspaces: () => current().workspaces.get(),
      workspace: dir => workspaceRpc(env, dir),
      defaultWorkspace: env.DEFAULT_WORKSPACE || null,
    })),
    defaultHandler: { fetch: (request, env, ctx) => route(request, env, ctx, settings) },
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: ['hecate'],
    requiredScopes: ['hecate'],
    resourceMetadata: { resource: `${settings.origin}/mcp`, authorization_servers: [settings.origin], resource_name: 'HECATE' },
    refreshTokenIdleTTL: 30 * DAY,
    clientRegistrationCallback: ({ clientMetadata }) => {
      const uris = Array.isArray(clientMetadata.redirect_uris) ? clientMetadata.redirect_uris : []
      if (uris.length > 0 && uris.every(u => typeof u === 'string' && redirectAllowed(u, settings.redirectHosts))) return
      return { code: 'invalid_redirect_uri', description: 'HECATE accepts redirects only to approved hosts and loopback', status: 400 }
    },
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    if (new URL(request.url).pathname === '/health') return Response.json({ ok: true })
    const settings = authSettings(env)
    if ('missing' in settings) return Response.json({ error: 'Not configured', missing: settings.missing }, { status: 503 })
    const key = `${settings.origin}|${settings.redirectHosts.join(',')}`
    if (shared?.key !== key) {
      const options = providerOptions(settings)
      shared = { key, options, provider: new OAuthProvider(options), workspaces: new WorkspaceList(storeFor(env, new Map())) }
    }
    return shared.provider.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
