/**
 * validate.ts — shallow structural validation for data files loaded from GitHub
 *
 * getFile() casts JSON.parse output straight to the schema type, so a malformed
 * or partially-written file would otherwise crash components at render time with
 * cryptic errors. These guards check the top-level containers each page dereferences
 * (arrays it maps over, objects it indexes into) and throw a clear, named error
 * that loadFile surfaces as the slice's error state.
 *
 * Deliberately shallow: top-level keys + array/object-ness only, not full field
 * validation. Missing required containers throw rather than being defaulted —
 * silently defaulting to [] would let the next auto-save overwrite real remote
 * data with an empty file.
 */

import type { DataFileName, SliceData } from '@/lib/schemas'

function fail(name: DataFileName, detail: string): never {
  throw new Error(`${name}.json is malformed: ${detail}. Fix the file in the data repo, then retry.`)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireArray(name: DataFileName, data: Record<string, unknown>, key: string): unknown[] {
  if (!Array.isArray(data[key])) fail(name, `expected "${key}" to be an array`)
  return data[key] as unknown[]
}

/**
 * Validate the parsed JSON for a data file. Returns the data typed as SliceData<K>
 * on success; throws an Error with a user-readable message on structural problems.
 */
export function validateFile<K extends DataFileName>(name: K, data: unknown): SliceData<K> {
  if (!isObject(data)) fail(name, 'top level is not an object')

  switch (name as DataFileName) {
    case 'tasks': {
      const columns = requireArray(name, data, 'columns')
      columns.forEach((col, i) => {
        if (!isObject(col) || !Array.isArray(col.tasks)) {
          fail(name, `columns[${i}] is missing a "tasks" array`)
        }
      })
      break
    }

    case 'focus': {
      requireArray(name, data, 'sections')
      if (data.calendarEvents !== undefined && !Array.isArray(data.calendarEvents)) {
        fail(name, 'expected "calendarEvents" to be an array when present')
      }
      break
    }

    case 'projects': {
      const projects = requireArray(name, data, 'projects')
      projects.forEach((p, i) => {
        if (!isObject(p)) fail(name, `projects[${i}] is not an object`)
        for (const key of ['timeline', 'openQuestions', 'sections'] as const) {
          if (!Array.isArray(p[key])) fail(name, `projects[${i}] is missing a "${key}" array`)
        }
        if (p.models !== null && p.models !== undefined && !Array.isArray(p.models)) {
          fail(name, `projects[${i}].models must be an array or null`)
        }
      })
      break
    }

    case 'weekly_log': {
      const weeks = requireArray(name, data, 'weeks')
      weeks.forEach((w, i) => {
        if (!isObject(w)) fail(name, `weeks[${i}] is not an object`)
        for (const key of ['completed', 'carriedForward', 'delayed', 'nextWeek'] as const) {
          if (!Array.isArray(w[key])) fail(name, `weeks[${i}] is missing a "${key}" array`)
        }
        if (!isObject(w.narrative)) fail(name, `weeks[${i}] is missing a "narrative" object`)
      })
      break
    }

    case 'archive': {
      const weeks = requireArray(name, data, 'weeks')
      weeks.forEach((w, i) => {
        if (!isObject(w) || !Array.isArray(w.done) || !Array.isArray(w.notDoing)) {
          fail(name, `weeks[${i}] is missing "done"/"notDoing" arrays`)
        }
      })
      break
    }

    case 'memory': {
      for (const key of ['people', 'terms', 'projects', 'recurringResponsibilities'] as const) {
        requireArray(name, data, key)
      }
      if (!isObject(data.referenceFiles)) fail(name, 'expected "referenceFiles" to be an object')
      break
    }

    case 'settings': {
      requireArray(name, data, 'oneOnOnePeople')
      if (typeof data.autoSaveDebounceMs !== 'number') fail(name, 'expected "autoSaveDebounceMs" to be a number')
      if (typeof data.pollIntervalMs !== 'number') fail(name, 'expected "pollIntervalMs" to be a number')
      break
    }
  }

  return data as unknown as SliceData<K>
}
