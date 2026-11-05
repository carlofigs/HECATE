/**
 * web-auth.ts — signing in to the web app with GitHub.
 *
 * /auth/login sets a short-lived signed cookie holding the state and PKCE
 * verifier (SameSite=Lax, so it survives the redirect back from GitHub) and
 * sends the user to GitHub. /auth/callback checks it, asks GitHub who signed
 * in, refuses anyone but the allowlisted user, and sets the session cookie
 * (SameSite=Strict). The redirect home goes through a same-site page so the
 * Strict cookie is sent on the first load.
 */

import type { AuthSettings } from '../auth/config.ts'
import { authorizeUrl, randomToken, s256, signInWithCode, GitHubSignInError, type Fetch } from '../auth/github-oauth.ts'
import { messagePage } from '../auth/pages.ts'
import { LOGIN_COOKIE, SESSION_COOKIE, SESSION_SECONDS, cookie, readCookie, signToken, verifyToken } from '../auth/session.ts'

export interface WebAuthDeps {
  settings: AuthSettings
  fetch?: Fetch
  now?: () => number
}

interface LoginState {
  state: string
  verifier: string
  back: string
  exp: number
}

const LOGIN_SECONDS = 600
const SAFE_BACK = /^\/(?![/\\])[^\s]*$/

const callbackUrl = (settings: AuthSettings): string => `${settings.origin}/auth/callback`

export async function login(request: Request, deps: WebAuthDeps): Promise<Response> {
  const now = (deps.now ?? Date.now)()
  const requested = new URL(request.url).searchParams.get('back') ?? '/'
  const verifier = randomToken()
  const state = randomToken()
  const token = await signToken(
    { state, verifier, back: SAFE_BACK.test(requested) ? requested : '/', exp: Math.floor(now / 1000) + LOGIN_SECONDS } satisfies LoginState,
    deps.settings.authSecret, 'login',
  )
  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl({ clientId: deps.settings.clientId, redirectUri: callbackUrl(deps.settings), state, challenge: await s256(verifier) }),
      'set-cookie': cookie(LOGIN_COOKIE, token, { maxAge: LOGIN_SECONDS, sameSite: 'Lax' }),
      'cache-control': 'no-store',
    },
  })
}

export async function callback(request: Request, deps: WebAuthDeps): Promise<Response> {
  const { settings } = deps
  const now = (deps.now ?? Date.now)()
  const params = new URL(request.url).searchParams
  const clear = cookie(LOGIN_COOKIE, '', { maxAge: 0, sameSite: 'Lax' })
  const pending = await verifyToken<LoginState>(readCookie(request, LOGIN_COOKIE), settings.authSecret, 'login', now)
  if (!pending || params.get('state') !== pending.state) {
    return messagePage('Sign-in expired', 'That sign-in link is no longer valid. Start again from the app.', 400, { 'set-cookie': clear })
  }
  if (params.get('error') || !params.get('code')) {
    return messagePage('Not signed in', 'GitHub did not complete the sign-in.', 400, { 'set-cookie': clear })
  }
  let user
  try {
    user = await signInWithCode({
      code: params.get('code') as string, verifier: pending.verifier, redirectUri: callbackUrl(settings),
      clientId: settings.clientId, clientSecret: settings.clientSecret, ...(deps.fetch ? { fetch: deps.fetch } : {}),
    })
  } catch (error) {
    if (error instanceof GitHubSignInError) return messagePage('Not signed in', error.message, 502, { 'set-cookie': clear })
    throw error
  }
  if (user.id !== settings.allowedUserId) {
    return messagePage('Not allowed', 'This HECATE belongs to someone else.', 403, { 'set-cookie': clear })
  }
  const session = await signToken({ sub: user.id, login: user.login, exp: Math.floor(now / 1000) + SESSION_SECONDS }, settings.authSecret, 'session')
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  headers.append('set-cookie', clear)
  headers.append('set-cookie', cookie(SESSION_COOKIE, session, { maxAge: SESSION_SECONDS, sameSite: 'Strict' }))
  // A same-site hop, so the Strict session cookie is sent with the first page load.
  const back = JSON.stringify(pending.back).replace(/</g, '\\u003c')
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${pending.back.replace(/"/g, '%22')}"><title>Signed in</title><script>location.replace(${back})</script>`,
    { status: 200, headers },
  )
}

export function logout(request: Request, deps: WebAuthDeps): Response {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } })
  if (request.headers.get('origin') !== deps.settings.origin) return new Response('Cross-origin request refused', { status: 403 })
  return new Response(null, { status: 204, headers: { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, sameSite: 'Strict' }) } })
}
