/**
 * mcp.ts — the /mcp resource, behind the OAuth provider's bearer check.
 *
 * The allowlist is checked again on every request, so changing
 * ALLOWED_GITHUB_USER_ID shuts out tokens issued before the change. The
 * protocol is @modelcontextprotocol/server's createMcpHandler: the current
 * revision, plus stateless serving for clients still on the 2025 revisions.
 */

import { createMcpHandler } from '@modelcontextprotocol/server'
import { createHecateServer, type McpDeps } from '../mcp/server.ts'

export interface McpProps {
  userId: string
  login: string
}

const propsOf = (props: unknown): McpProps | null => {
  const p = props as Partial<McpProps> | null
  return p && typeof p.userId === 'string' && typeof p.login === 'string' ? { userId: p.userId, login: p.login } : null
}

export function mcpApiHandler<E extends { ALLOWED_GITHUB_USER_ID?: string }>(depsFor: (env: E) => McpDeps) {
  return {
    async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
      const props = propsOf(ctx.props)
      if (!props || !env.ALLOWED_GITHUB_USER_ID || props.userId !== env.ALLOWED_GITHUB_USER_ID) {
        return Response.json({ error: 'Not allowed' }, { status: 403 })
      }
      const deps = depsFor(env)
      return createMcpHandler(() => createHecateServer(deps), { legacy: 'stateless' }).fetch(request)
    },
  }
}
