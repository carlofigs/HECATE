/**
 * env.ts — the Worker's bindings and configuration, and the store built from them.
 */

import { appTokenProvider, createGitStore, type GitStore } from '@hecate/github-store'
import type { WorkspaceDO } from './workspace-do.ts'

export interface Env {
  WORKSPACE: DurableObjectNamespace<WorkspaceDO>
  /** The data repository and branch (v2 runs on `v2` until cutover). */
  GITHUB_OWNER: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
  /** The GitHub App (ADR 0003). The private key is a Worker secret, never a var. */
  GITHUB_APP_ID?: string
  GITHUB_APP_PRIVATE_KEY?: string
  GITHUB_INSTALLATION_ID?: string
  /** Local development and tests only: a repository token used instead of the App. */
  GITHUB_TOKEN?: string
  /** Milliseconds between coalesced commits. */
  COMMIT_INTERVAL_MS?: string

  // ─── Sign-in and the MCP connector (ADR 0003) ───
  /** Where this Worker is served, e.g. https://hecate.example.workers.dev. */
  PUBLIC_URL?: string
  /** The GitHub App's OAuth client, used to sign in. The secret is a Worker secret. */
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  /** The one GitHub user (numeric id) allowed in. */
  ALLOWED_GITHUB_USER_ID?: string
  /** Signs sessions and remembered consent: 32+ characters, a Worker secret. */
  AUTH_SECRET?: string
  /** Verifies the data repository's push webhook. A Worker secret. */
  GITHUB_WEBHOOK_SECRET?: string
  /** The workspace MCP tools use when a call names none. */
  DEFAULT_WORKSPACE?: string
  /** Hosts an MCP client may redirect to (comma-separated); loopback is always allowed. */
  MCP_REDIRECT_HOSTS?: string
  /** OAuth clients, grants and tokens (hashed), kept by @cloudflare/workers-oauth-provider. */
  OAUTH_KV: KVNamespace
}

export function storeFor(env: Env, blobs: Map<string, string>): GitStore {
  const missing = (['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH'] as const).filter(k => !env[k])
  if (missing.length > 0) throw new Error(`Missing configuration: ${missing.join(', ')}`)
  let token: () => Promise<string>
  if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY) {
    token = appTokenProvider({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      ...(env.GITHUB_INSTALLATION_ID ? { installationId: Number(env.GITHUB_INSTALLATION_ID) } : {}),
      userAgent: 'hecate-worker',
    })
  } else if (env.GITHUB_TOKEN) {
    const fixed = env.GITHUB_TOKEN
    token = () => Promise.resolve(fixed)
  } else {
    throw new Error('No GitHub credentials: set GITHUB_APP_ID and the GITHUB_APP_PRIVATE_KEY secret')
  }
  return createGitStore({
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH,
    token,
    userAgent: 'hecate-worker',
    blobCache: { get: sha => blobs.get(sha), set: (sha, text) => void blobs.set(sha, text) },
  })
}
