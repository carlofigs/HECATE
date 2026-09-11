/**
 * config.ts — server configuration from the environment
 *
 * The app keeps credentials in localStorage; a stdio server has no such thing,
 * so everything arrives as environment variables set by whichever MCP client
 * spawns the process. Read once at startup and fail loudly: a half-configured
 * server that starts and then errors on every call is harder to diagnose than
 * one that refuses to start.
 */

export interface McpConfig {
  token: string
  owner: string
  repo: string
  /** Default workspace for tools that do not name one explicitly. */
  workspace: string
}

const REQUIRED = {
  token:     'HECATE_GITHUB_TOKEN',
  owner:     'HECATE_OWNER',
  repo:      'HECATE_REPO',
  workspace: 'HECATE_WORKSPACE',
} as const

export class ConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
      `Set them in the MCP client's server config. ` +
      `HECATE_GITHUB_TOKEN needs a fine-grained PAT with Contents: Read on the data repo.`,
    )
    this.name = 'ConfigError'
  }
}

/**
 * Read config from the environment. Throws ConfigError naming every missing
 * variable at once, rather than failing on the first and hiding the rest.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const missing: string[] = []
  const read = (key: string): string => {
    const v = env[key]?.trim()
    if (!v) { missing.push(key); return '' }
    return v
  }

  const config: McpConfig = {
    token:     read(REQUIRED.token),
    owner:     read(REQUIRED.owner),
    repo:      read(REQUIRED.repo),
    workspace: read(REQUIRED.workspace),
  }

  if (missing.length > 0) throw new ConfigError(missing)
  return config
}
