/**
 * authorize.ts — connecting an MCP client (claude.ai, Claude Code) to HECATE.
 *
 * The OAuth provider library validates the request; this page does the rest,
 * in the order MCP's security guidance requires for a server that signs
 * people in through another provider:
 *
 * 1. GET /authorize: the redirect URI must be on an allowed host; then a
 *    consent page (unless the user approved this client recently).
 * 2. POST /authorize: Allow starts GitHub sign-in (state and PKCE bound to
 *    this browser by beginUpstream); Deny goes back with access_denied.
 * 3. GET /oauth/github/callback: GitHub says who signed in; anyone but the
 *    allowlisted user is sent back with access_denied. The GitHub token is
 *    dropped; the grant carries only the user's id and login.
 */

import { AuthorizationError, CimdFetchError, authorizationErrorRedirect, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import type { AuthSettings } from '../auth/config.ts'
import { authorizeUrl, randomToken, s256, signInWithCode, GitHubSignInError, type Fetch } from '../auth/github-oauth.ts'
import { consentPage, messagePage } from '../auth/pages.ts'
import { redirectAllowed } from '../auth/redirects.ts'
import { derivedSecret } from '../auth/session.ts'
import type { McpProps } from './mcp.ts'

export interface AuthorizeDeps {
  oauth: OAuthHelpers
  settings: AuthSettings
  fetch?: Fetch
}

const REMEMBER_SECONDS = 30 * 24 * 60 * 60
const githubCallbackUrl = (settings: AuthSettings): string => `${settings.origin}/oauth/github/callback`

function failure(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302)
  if (error instanceof AuthorizationError) return messagePage('Cannot connect', error.description, 400)
  if (error instanceof CimdFetchError) return messagePage('Cannot connect', 'This app could not be verified.', 400)
  throw error
}

async function toGitHub(authRequest: AuthRequest, headers: Headers, deps: AuthorizeDeps): Promise<Response> {
  const verifier = randomToken()
  const upstream = await deps.oauth.beginUpstream(authRequest, { data: { verifier }, headers })
  upstream.headers.set('location', authorizeUrl({
    clientId: deps.settings.clientId, redirectUri: githubCallbackUrl(deps.settings), state: upstream.state, challenge: await s256(verifier),
  }))
  return new Response(null, { status: 302, headers: upstream.headers })
}

export async function authorize(request: Request, deps: AuthorizeDeps): Promise<Response> {
  const { oauth, settings } = deps
  const remember = { secret: await derivedSecret(settings.authSecret, 'consent'), maxAgeSeconds: REMEMBER_SECONDS }
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request)
      const details = await oauth.describeConsent(authRequest)
      if (!redirectAllowed(details.redirectUri, settings.redirectHosts)) {
        return messagePage('Cannot connect', `HECATE does not send access to ${details.redirectHost}.`, 400)
      }
      if (await oauth.isConsentRemembered(request, authRequest, remember)) return await toGitHub(authRequest, new Headers(), deps)
      const consent = await oauth.beginConsent(authRequest)
      consent.headers.set('content-type', 'text/html; charset=utf-8')
      return new Response(consentPage(details, consent.handle), { headers: consent.headers })
    }
    if (request.method === 'POST') {
      const form = await request.formData()
      const field = form.get('handle')
      const handle = typeof field === 'string' ? field : ''
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(request, handle)
        return new Response(null, { status: 302, headers: denied.headers })
      }
      const approved = await oauth.approveConsent(request, handle, form.get('remember') ? { remember } : {})
      if (!redirectAllowed(approved.request.redirectUri, settings.redirectHosts)) {
        return messagePage('Cannot connect', 'HECATE does not send access to that address.', 400)
      }
      return await toGitHub(approved.request, approved.headers, deps)
    }
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } })
  } catch (error) {
    return failure(error)
  }
}

export async function githubCallback(request: Request, deps: AuthorizeDeps): Promise<Response> {
  const { oauth, settings } = deps
  let resumed
  try {
    resumed = await oauth.finishUpstream<{ verifier: string }>(request)
  } catch (error) {
    return failure(error)
  }
  const back = (code: 'access_denied' | 'server_error', description: string): Response => {
    resumed.headers.set('location', authorizationErrorRedirect(resumed.request, code, description))
    return new Response(null, { status: 302, headers: resumed.headers })
  }
  const params = new URL(request.url).searchParams
  const code = params.get('code')
  if (params.get('error') || !code) return back('access_denied', 'GitHub sign-in was not completed')

  let user
  try {
    user = await signInWithCode({
      code, verifier: resumed.data.verifier, redirectUri: githubCallbackUrl(settings),
      clientId: settings.clientId, clientSecret: settings.clientSecret, ...(deps.fetch ? { fetch: deps.fetch } : {}),
    })
  } catch (error) {
    if (error instanceof GitHubSignInError) return back('server_error', error.message)
    throw error
  }
  if (user.id !== settings.allowedUserId) return back('access_denied', 'This HECATE belongs to someone else')

  const { redirectTo } = await oauth.completeAuthorization({
    request: resumed.request,
    userId: user.id,
    metadata: { login: user.login },
    scope: resumed.request.scope,
    props: { userId: user.id, login: user.login } satisfies McpProps,
  })
  resumed.headers.set('location', redirectTo)
  return new Response(null, { status: 302, headers: resumed.headers })
}
