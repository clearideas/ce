<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ActionStore } from '../../types/ui'

interface Props {
  icon?: string
  loading?: string
  loadingDuration?: number
  success?: string
  successDuration?: number
  failure?: string
  failureDuration?: number
  action?: string
  /** Factory returning the store whose `action` should drive the icon state. */
  store?: () => ActionStore | undefined
  color?: string
}
const props = withDefaults(defineProps<Props>(), {
  icon: 'fas fa-house',
  loading: 'fas fa-arrows-rotate',
  loadingDuration: 2000,
  success: 'fas fa-check',
  successDuration: 5000,
  failure: 'fas fa-xmark',
  failureDuration: 10000,
  action: '',
  store: () => undefined,
  color: 'secondary',
})

const currentIcon = ref<string>('')
const currentColor = ref<string>('grey')
const timeoutId = ref<number | null>(null)
const storeInstance = ref<ActionStore | undefined>(undefined)
let unsubscribeFromStore: (() => void) | undefined

// Initialize the store if provided
onMounted(() => {
  try {
    if (typeof props.store === 'function') {
      storeInstance.value = props.store()
    }
  } catch {}

  // Set initial icon state regardless of store
  currentIcon.value = props.icon
  currentColor.value = props.color
})

function setIcon(icon: string, color: string) {
  currentIcon.value = icon
  currentColor.value = color
}

function resetIcon() {
  currentIcon.value = props.icon
  currentColor.value = props.color
}

function startIconTimeout(icon: string, color: string, duration: number) {
  clearIconTimeout()
  setIcon(icon, color)
  timeoutId.value = window.setTimeout(() => resetIcon(), duration)
}

function clearIconTimeout() {
  if (timeoutId.value) {
    window.clearTimeout(timeoutId.value)
    timeoutId.value = null
  }
}

// Subscribe to the store action (if any); always release the previous subscription first.
watch(
  () => storeInstance.value,
  newStore => {
    unsubscribeFromStore?.()
    unsubscribeFromStore = undefined
    if (!newStore?.$onAction || !props.action) return

    unsubscribeFromStore = newStore.$onAction(({ after, onError, name }) => {
      if (name !== props.action) return
      if (currentIcon.value !== props.loading)
        startIconTimeout(props.loading, 'primary', props.loadingDuration)
      after(() => startIconTimeout(props.success, 'success', props.successDuration))
      onError(() => startIconTimeout(props.failure, 'error', props.failureDuration))
    })
  },
  { immediate: true },
)

onUnmounted(() => {
  clearIconTimeout()
  unsubscribeFromStore?.()
  unsubscribeFromStore = undefined
})
</script>

<template>
  <VIcon class="status-icon" :icon="currentIcon" :color="currentColor" />
</template>
