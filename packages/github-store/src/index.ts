/**
 * @hecate/github-store — HECATE v2's storage: a branch of the data repository
 * read and written through the Git Data API (ADR 0001), authenticated as the
 * GitHub App (ADR 0003). Platform-neutral: fetch and WebCrypto only, so the
 * same code runs in the Worker and in Node.
 */

export { createGitStore, gitBlobSha, type GitStore, type GitStoreOptions, type BlobCache, type Head, type TreeEntry, type Files, type TreeDiff, type CommitResult } from './store.ts'
export { appTokenProvider, createAppJwt, importPrivateKey, type AppAuthOptions } from './app-auth.ts'
export { verifyWebhookSignature } from './webhook.ts'
export { GitHubError, RateLimitError, GITHUB_API, type Fetch } from './http.ts'
