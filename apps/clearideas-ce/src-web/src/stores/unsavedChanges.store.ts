import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Coordinates the app-level "You have unsaved changes" dialog (rendered once in `AppLayout`).
 * Route guards call `confirmLeave()` and await the user's decision; no `window.confirm`.
 */
export const useUnsavedChangesStore = defineStore('unsaved-changes', () => {
  const open = ref(false)
  let resolver: ((leave: boolean) => void) | undefined

  function confirmLeave(): Promise<boolean> {
    if (resolver) resolver(false)
    open.value = true
    return new Promise<boolean>(resolve => {
      resolver = resolve
    })
  }

  function resolve(leave: boolean) {
    open.value = false
    resolver?.(leave)
    resolver = undefined
  }

  return { open, confirmLeave, resolve }
})
