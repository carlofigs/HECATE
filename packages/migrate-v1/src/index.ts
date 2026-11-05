/**
 * @hecate/migrate-v1 — one-way conversion of v1 workspaces to the v2 layout
 * (ADR 0008). Run it with `pnpm migrate-v1`; see cli.ts for the options.
 */

export { migrateWorkspace, type MigrateResult } from './migrate.ts'
export { migrateConfigSchema, resolveConfig, type MigrateConfig, type ResolvedConfig, type WorkspaceConfig } from './config.ts'
export { renderReport, isReady, type WorkspaceReport } from './report.ts'
export { FIELD_MAP, type Disposition, type FieldEntry } from './fields.ts'
export { V1_FILES, type V1Files } from './v1.ts'
