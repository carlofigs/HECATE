/**
 * jsonSchema.ts — JSON Schema (draft 2020-12) for every file kind, generated
 * from the zod schemas so the two cannot disagree.
 *
 * The generated files are committed under packages/core/json-schema/ and
 * checked by a snapshot test: CI fails if a schema changes without them being
 * regenerated (`pnpm export-schema`). They are what the MCP server serves as
 * resources and what anything outside TypeScript validates against.
 *
 * Refinements (uniqueness, cross-field rules) are not expressible in JSON
 * Schema and are not in these files. They are enforced by parseFile.
 */

import { z } from 'zod'
import { CURRENT_VERSION, FILE_KINDS, type FileKind } from './kinds.ts'
import { schemas } from './files.ts'

const OPTIONS = { target: 'draft-2020-12', unrepresentable: 'throw', reused: 'inline' } as const

export function toJsonSchema(kind: FileKind, io: 'input' | 'output' = 'input'): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schemas[kind], { ...OPTIONS, io }) as Record<string, unknown>
  return { $schema, $id: `urn:hecate:${kind}:v${CURRENT_VERSION[kind]}`, ...rest }
}

export function toJsonSchemas(): Record<FileKind, Record<string, unknown>> {
  return Object.fromEntries(FILE_KINDS.map(kind => [kind, toJsonSchema(kind)])) as Record<FileKind, Record<string, unknown>>
}
