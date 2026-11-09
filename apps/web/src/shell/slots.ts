/** Where a page can place its primary action in the shell's bottom bar (M-app-07), below `md`. */
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

const store = createStore<{ bottomAction: HTMLElement | null }>()(() => ({ bottomAction: null }))

/** The shell's ref callback for the slot. */
export const setBottomActionSlot = (element: HTMLElement | null): void => store.setState({ bottomAction: element })

export const useBottomActionSlot = (): HTMLElement | null => useStore(store, s => s.bottomAction)
