/**
 * useCollapsed — persisted collapse state for any list of IDs
 *
 * Backed by localStorage so collapsed sections survive refresh.
 * Each usage site gets its own storage key to keep state isolated.
 *
 * Usage:
 *   const { isCollapsed, toggle, collapseAll, expandAll } = useCollapsed('hecate:focus:collapsed')
 */

import { useState, useCallback } from 'react'

export function useCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>()
    } catch {
      return new Set<string>()
    }
  })

  const persist = useCallback((next: Set<string>) => {
    localStorage.setItem(storageKey, JSON.stringify([...next]))
  }, [storageKey])

  const toggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      persist(next)
      return next
    })
  }, [persist])

  const collapseAll = useCallback((ids: string[]) => {
    const next = new Set(ids)
    persist(next)
    setCollapsed(next)
  }, [persist])

  const expandAll = useCallback(() => {
    persist(new Set())
    setCollapsed(new Set())
  }, [persist])

  const isCollapsed = useCallback((id: string) => collapsed.has(id), [collapsed])

  return { isCollapsed, toggle, collapseAll, expandAll, collapsedCount: collapsed.size }
}
