/**
 * github-oauth.ts — "Sign in with GitHub", through the GitHub App's OAuth
 * client (ADR 0003).
 *
 * The flow only establishes who the user is: the user token is used once to
 * read /user and then dropped. It is never stored, and it carries no access
 * to the data repository (that is the App installation's job).
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface GitHubUser {
  /** Numeric id, as a string: logins can be renamed, ids cannot. */
  id: string
  login: string
}

export class GitHubSignInError extends Error {
  override readonly name = 'GitHubSignInError'
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A random URL-safe string with `bytes` of entropy. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** PKCE S256 (RFC 7636). */
export async function s256(verifier: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

export function authorizeUrl(options: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(GITHUB_AUTHORIZE_URL)
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('state', options.state)
  url.searchParams.set('code_challenge', options.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('allow_signup', 'false')
  return url.toString()
}

/** Exchange the code GitHub returned for a token, read the user, and drop the token. */
export async function signInWithCode(options: {
  code: string
  verifier: string
  redirectUri: string
  clientId: string
  clientSecret: string
  fetch?: Fetch
}): Promise<GitHubUser> {
  const call = options.fetch ?? ((input, init) => fetch(input, init))
  const tokenResponse = await call(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'hecate-worker' },
    body: JSON.stringify({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      redirect_uri: options.redirectUri,
      code_verifier: options.verifier,
    }),
  })
  const token = (await tokenResponse.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }
  if (!tokenResponse.ok || !token.access_token) {
    throw new GitHubSignInError(`GitHub sign-in failed: ${token.error_description ?? token.error ?? tokenResponse.statusText}`)
  }
  const userResponse = await call(GITHUB_USER_URL, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'hecate-worker',
    },
  })
  const user = (await userResponse.json().catch(() => ({}))) as { id?: unknown; login?: unknown }
  if (!userResponse.ok || typeof user.id !== 'number' || typeof user.login !== 'string') {
    throw new GitHubSignInError(`GitHub did not say who signed in (${userResponse.status})`)
  }
  return { id: String(user.id), login: user.login }
}
