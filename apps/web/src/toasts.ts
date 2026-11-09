/** The toasts on screen. Anything can push one; the Toaster in the shell shows them. */
import type { ToastItem } from '@hecate/ui'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

interface Toasts {
  toasts: ToastItem[]
}

const store = createStore<Toasts>()(() => ({ toasts: [] }))
let next = 0

export function pushToast(toast: Omit<ToastItem, 'id'>): void {
  next++
  store.setState(s => ({ toasts: [...s.toasts.slice(-2), { ...toast, id: String(next) }] }))
}

export function dismissToast(id: string): void {
  store.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}

export const useToasts = (): ToastItem[] => useStore(store, s => s.toasts)
