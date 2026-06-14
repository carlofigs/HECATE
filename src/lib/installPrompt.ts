/**
 * installPrompt — captures Chrome's `beforeinstallprompt` event so the app can
 * offer its own "Install" affordance.
 *
 * Chrome on Android no longer shows an automatic install banner; meeting the PWA
 * install criteria only fires `beforeinstallprompt` and unlocks the ⋮-menu entry.
 * We preventDefault the event, stash it, and replay it from a button click via
 * `promptInstall()`.
 *
 * The listener is registered at module-import time (not inside a component) so the
 * event isn't missed if it fires before React has mounted. Import this module once
 * for its side effect (see main.tsx); components read it through useInstallPrompt.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's own mini-infobar so our in-app button is the single entry point.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  // Once installed, drop the saved event so the button hides.
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

/** True when Chrome has offered an install we can replay. */
export function canInstall(): boolean {
  return deferred !== null
}

/** Subscribe to availability changes; returns an unsubscribe fn. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Replay the saved prompt. A prompt can only be used once, so the saved event is
 * cleared afterwards regardless of the user's choice.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  const evt = deferred
  deferred = null
  emit()
  await evt.prompt()
  const { outcome } = await evt.userChoice
  return outcome
}
