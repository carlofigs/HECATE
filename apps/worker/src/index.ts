/**
 * The HECATE v2 Worker. In this PR it hosts the WorkspaceDO and a health
 * check only: /api, /mcp, /oauth and /hooks arrive with authentication
 * (P2 · feat/worker-auth), so nothing here can reach a workspace yet.
 */

import type { Env } from './env.ts'

export { WorkspaceDO } from './workspace-do.ts'

export default {
  fetch(request: Request): Response {
    if (new URL(request.url).pathname === '/health') return Response.json({ ok: true })
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
