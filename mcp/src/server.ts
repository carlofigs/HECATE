/**
 * server.ts — server construction, independent of transport
 *
 * Nothing here knows whether it is speaking over stdio or HTTP. index.ts picks
 * the transport; adding an HTTP one later means a new entry point, not a
 * rewrite. The storage adapter is injected for the same reason.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StorageAdapter } from './storage/types'
import type { McpConfig } from './config'
import { registerReadTools } from './tools/read'

export const SERVER_NAME = 'hecate'
export const SERVER_VERSION = '0.1.0'

export function createServer(storage: StorageAdapter, config: McpConfig): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerReadTools(server, storage, config)
  return server
}
