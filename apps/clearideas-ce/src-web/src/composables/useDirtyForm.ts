import { computed, ref, toRaw, type Ref } from 'vue'

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` compare equal. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, current: unknown) =>
    current && typeof current === 'object' && !Array.isArray(current)
      ? Object.fromEntries(
          Object.entries(current as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : current,
  )
}

/**
 * Track whether a form differs from its last saved/loaded state.
 *
 *   const { dirty, markClean } = useDirtyForm(() => ({ name: form.name, tz: form.tz }))
 *   // after a successful save, or after (re)loading values from the server:
 *   markClean()
 *
 * Comparison is structural (JSON, key order ignored) and synchronous: `markClean()` snapshots the getter's current
 * value immediately, so it can be called right after assigning loaded values.
 */
export function useDirtyForm<T>(source: () => T): { dirty: Ref<boolean>; markClean: () => void } {
  const serialize = () => stableStringify(toRaw(source()))
  const snapshot = ref(serialize())

  function markClean() {
    snapshot.value = serialize()
  }

  return { dirty: computed(() => serialize() !== snapshot.value), markClean }
}
