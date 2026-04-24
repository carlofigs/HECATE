/**
 * useInlineEdit — generic draft/commit/discard/blur-debounce hook
 *
 * Shared by FocusSectionCard, WeekLog narrative sections, and Projects sections.
 * T is the shape of the editable value — string for simple content fields,
 * or an object like { title: string; content: string } for multi-field sections.
 *
 * Key design decisions:
 * - onCommit is stored in a ref so commit() is always referentially stable
 *   (zero-dep useCallback), which prevents cascading re-memoisation of
 *   onTextareaBlur / onTextareaKeyDown / onTitleKeyDown.
 * - committed is also ref-tracked so startEdit() always resets to the
 *   latest prop value even if the prop changed between renders.
 * - draftRef mirrors state so commit() never captures stale draft via closure.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

interface Options {
  /** Milliseconds before a textarea blur auto-commits. Default: 200 */
  blurDebounceMs?: number
}

export interface UseInlineEditResult<T> {
  editing:            boolean
  draft:              T
  setDraft:           React.Dispatch<React.SetStateAction<T>>
  startEdit:          () => void
  commit:             () => void
  discard:            () => void
  onTextareaBlur:     () => void
  onTextareaKeyDown:  (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onTitleKeyDown:     (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function useInlineEdit<T>(
  committed: T,
  onCommit:  (value: T) => void,
  options?:  Options,
): UseInlineEditResult<T> {
  const { blurDebounceMs = 200 } = options ?? {}

  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState<T>(committed)

  // Stable refs — all callbacks below read through refs, never from closure
  const committedRef    = useRef(committed)
  const draftRef        = useRef(draft)
  const onCommitRef     = useRef(onCommit)
  const blurTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { committedRef.current = committed }, [committed])
  useEffect(() => { draftRef.current    = draft      }, [draft])
  useEffect(() => { onCommitRef.current = onCommit   }, [onCommit])

  // ── Actions ───────────────────────────────────────────────────────────────

  function startEdit() {
    setDraft(committedRef.current)
    setEditing(true)
  }

  // All three are stable (empty dep array) — they read from refs, never state
  const commit = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    onCommitRef.current(draftRef.current)
    setEditing(false)
  }, [])

  const discard = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    setEditing(false)
  }, [])

  const onTextareaBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(commit, blurDebounceMs)
  }, [commit, blurDebounceMs])

  const onTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit()  }
    if (e.key === 'Escape')                             { e.preventDefault(); discard() }
  }, [commit, discard])

  const onTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault() /* tab to textarea via natural focus order */ }
    if (e.key === 'Escape') { e.preventDefault(); discard() }
  }, [discard])

  return {
    editing,
    draft,
    setDraft,
    startEdit,
    commit,
    discard,
    onTextareaBlur,
    onTextareaKeyDown,
    onTitleKeyDown,
  }
}
