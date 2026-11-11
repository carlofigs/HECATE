import { useStore } from 'zustand'
import { createApi } from './api.ts'
import { createAppStore, type AppState } from './store.ts'
import { pushToast } from './toasts.ts'

/** The Worker's API. Pages that read more than the snapshot (the activity log) call it directly. */
export const api = createApi()

/** The one store the app runs on. Tests build their own with createAppStore. */
export const appStore = createAppStore(api, { notify: notice => pushToast(notice) })

export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector)
}
