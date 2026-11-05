/**
 * mcp.ts — the /mcp resource, behind the OAuth provider's bearer check.
 *
 * The tools arrive in P2 · feat/mcp-v2. Until then an authorised call gets a
 * JSON-RPC "method not found", which is enough to prove the connector can
 * authenticate. The allowlist is checked again on every request, so changing
 * ALLOWED_GITHUB_USER_ID shuts out tokens issued before the change.
 */

import type { Env } from '../env.ts'

export interface McpProps {
  userId: string
  login: string
}

const propsOf = (props: unknown): McpProps | null => {
  const p = props as Partial<McpProps> | null
  return p && typeof p.userId === 'string' && typeof p.login === 'string' ? { userId: p.userId, login: p.login } : null
}

export const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const props = propsOf(ctx.props)
    if (!props || !env.ALLOWED_GITHUB_USER_ID || props.userId !== env.ALLOWED_GITHUB_USER_ID) {
      return Response.json({ error: 'Not allowed' }, { status: 403 })
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } })
    const message = (await request.json().catch(() => null)) as { id?: unknown } | null
    const id = typeof message?.id === 'string' || typeof message?.id === 'number' ? message.id : null
    return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'HECATE MCP tools are not available yet' } })
  },
}
