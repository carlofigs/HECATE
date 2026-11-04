/**
 * The committed JSON Schemas must match the zod schemas. CI never writes
 * snapshots, so a schema change without `pnpm export-schema` fails here.
 */
import { describe, expect, it } from 'vitest'
import { FILE_KINDS } from './kinds.ts'
import { toJsonSchema, toJsonSchemas } from './jsonSchema.ts'

describe.each(FILE_KINDS)('%s JSON Schema', kind => {
  it('is committed and current', async () => {
    await expect(`${JSON.stringify(toJsonSchema(kind), null, 2)}\n`).toMatchFileSnapshot(`../json-schema/${kind}.schema.json`)
  })

  it('reads and writes the same shape (no defaults or transforms)', () => {
    expect(toJsonSchema(kind, 'output')).toEqual(toJsonSchema(kind, 'input'))
  })

  it('carries a versioned $id and forbids unknown keys', () => {
    const schema = toJsonSchema(kind)
    expect(schema.$id).toBe(`urn:hecate:${kind}:v1`)
    expect(schema.additionalProperties).toBe(false)
  })
})

it('covers every kind', () => {
  expect(Object.keys(toJsonSchemas()).sort()).toEqual([...FILE_KINDS].sort())
})
