#!/usr/bin/env node
/**
 * index.ts — stdio entry point
 *
 * Pages is static hosting and cannot run a server, so there is no hosted
 * transport to target. stdio covers the CLI and desktop natively, and cloud
 * sessions reach it through the desktop device bridge.
 *
 * Note on logging: stdout is the MCP wire protocol. Anything written there that
 * is not a protocol message corrupts the stream, so diagnostics go to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig, ConfigError } from './config'
import { GitHubStorage } from './storage/github'
import { createServer, SERVER_NAME, SERVER_VERSION } from './server'

async function main(): Promise<void> {
  const config = loadConfig()
  const storage = new GitHubStorage(config)
  const server = createServer(storage, config)

  await server.connect(new StdioServerTransport())
  console.error(
    `${SERVER_NAME} v${SERVER_VERSION} ready on stdio — ` +
    `${config.owner}/${config.repo}, default workspace "${config.workspace}"`,
  )
}

main().catch((err: unknown) => {
  // A misconfigured server should say what is missing and stop, not linger and
  // fail every call with the same error.
  if (err instanceof ConfigError) console.error(`hecate-mcp: ${err.message}`)
  else console.error('hecate-mcp: failed to start —', err)
  process.exit(1)
})
