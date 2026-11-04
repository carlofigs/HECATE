/**
 * useInstallPrompt — exposes PWA install availability + a trigger to components.
 *
 * `available` becomes true once Chrome fires `beforeinstallprompt` (i.e. the app
 * meets the install criteria and isn't already installed). Reads the module-level
 * capture in lib/installPrompt via useSyncExternalStore.
 */

import { useSyncExternalStore, useCallback } from 'react'
import { canInstall, subscribeInstall, promptInstall } from '@/lib/installPrompt'

export function useInstallPrompt() {
  const available = useSyncExternalStore(subscribeInstall, canInstall, () => false)
  const promptToInstall = useCallback(() => promptInstall(), [])
  return { available, promptToInstall }
}
