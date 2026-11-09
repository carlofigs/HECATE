import { useStore } from 'zustand'
import { createApi } from './api.ts'
import { createAppStore, type AppState } from './store.ts'

/** The one store the app runs on. Tests build their own with createAppStore. */
export const appStore = createAppStore(createApi())

export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector)
}
