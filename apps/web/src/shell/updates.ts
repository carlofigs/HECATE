/**
 * The service worker (vite-plugin-pwa, registerType 'prompt'), registered at
 * start-up so the app shell is cached from the first visit, signed in or
 * not. It checks for a new version on focus and every hour; when one is
 * waiting, the shell offers it (UpdateBanner). Never imported by unit tests:
 * the virtual module exists only in a Vite build.
 */
import { registerSW } from 'virtual:pwa-register'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/** How often an open app asks whether a new version has been deployed. */
const CHECK_MS = 60 * 60 * 1000

const store = createStore<{ needRefresh: boolean }>()(() => ({ needRefresh: false }))

const update = registerSW({
  onNeedRefresh: () => store.setState({ needRefresh: true }),
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = (): void => void registration.update().catch(() => {})
    setInterval(check, CHECK_MS)
    window.addEventListener('focus', check)
  },
})

/** Activates the waiting version and reloads into it. */
export const reloadToUpdate = (): void => void update(true)

export const useNeedRefresh = (): boolean => useStore(store, s => s.needRefresh)
