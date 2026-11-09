import { tokenPx } from '@hecate/ui'
import { useCallback, useSyncExternalStore } from 'react'

/** Whether the viewport is at least a breakpoint token wide, kept in step with resizes. */
export function useMinWidth(token: `--breakpoint-${string}`): boolean {
  const query = `(min-width: ${tokenPx(token)}px)`
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false)
}
