<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  icon?: string
  loading?: string
  loadingDuration?: number
  success?: string
  successDuration?: number
  failure?: string
  failureDuration?: number
  action?: string
  store?: Function // Prop to receive a function returning a store
  color?: string
}
const props = withDefaults(defineProps<Props>(), {
  icon: 'fasl fa-home',
  loading: 'fasl fa-rotate',
  loadingDuration: 2000,
  success: 'fasl fa-check',
  successDuration: 5000,
  failure: 'fasl fa-xmark',
  failureDuration: 10000,
  action: '',
  store: () => undefined,
  color: 'secondary',
})

const currentIcon = ref<string>('')
const currentColor = ref<string>('grey')
const timeoutId = ref<number | null>(null)
const storeInstance = ref<any>(undefined)

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

// Only set up store action monitoring if store and action are provided
watch(
  () => storeInstance.value,
  newStore => {
    if (newStore && props.action) {
      // Clean up any previous action handlers
      if (newStore.$onAction) {
        newStore.$onAction(
          ({
            after,
            onError,
            name,
          }: {
            after: (callback: () => void) => void
            onError: (callback: (error: Error) => void) => void
            name: string
          }) => {
            if (name === props.action) {
              if (currentIcon.value !== props.loading)
                startIconTimeout(props.loading, 'primary', props.loadingDuration)

              after(() => {
                startIconTimeout(props.success, 'success', props.successDuration)
              })

              onError(() => {
                startIconTimeout(props.failure, 'error', props.failureDuration)
              })
            }
          },
        )
      }
    }
  },
  { immediate: true },
)

// Clean up on unmount
onUnmounted(() => {
  clearIconTimeout()
})
</script>

<template>
  <VIcon class="status-icon" :icon="currentIcon" :color="currentColor" />
</template>
