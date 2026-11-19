import { onBeforeUnmount, onMounted, unref, type Ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useUnsavedChangesStore } from '../stores/unsavedChanges.store'

/**
 * While `dirty` is true, navigating away asks for confirmation through the app dialog, and
 * closing/reloading the tab triggers the browser's native prompt.
 *
 * "Away" includes navigations that keep the same route component (e.g. `/settings/profile` →
 * `/settings/notifications`, or a site's settings tab → its content tab): Vue Router calls
 * `beforeRouteUpdate`, not `beforeRouteLeave`, for those, so both are guarded.
 */
export function useUnsavedChangesGuard(dirty: Ref<boolean> | (() => boolean)) {
  const isDirty = () => (typeof dirty === 'function' ? dirty() : unref(dirty))
  const store = useUnsavedChangesStore()

  onBeforeRouteLeave(async () => {
    if (!isDirty()) return true
    return store.confirmLeave()
  })
  onBeforeRouteUpdate(async (to, from) => {
    if (!isDirty() || to.fullPath === from.fullPath) return true
    return store.confirmLeave()
  })

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty()) return
    event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
