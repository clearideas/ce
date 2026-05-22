import { onMounted, onUnmounted, type Ref, ref, watchEffect } from 'vue'

export interface UseContainerWidthOptions {
  /**
   * Breakpoint width below which the container is considered "narrow"
   * @default 768
   */
  narrowBreakpoint?: number
  /**
   * Breakpoint width below which the container is considered "mobile"
   * @default 600
   */
  mobileBreakpoint?: number
}

export interface UseContainerWidthReturn {
  /** Current width of the container */
  width: Ref<number>
  /** Whether the container is below the narrow breakpoint */
  isNarrow: Ref<boolean>
  /** Whether the container is below the mobile breakpoint */
  isMobile: Ref<boolean>
  /** Function to manually trigger a resize check */
  updateWidth: () => void
}

/**
 * Composable that watches a container's width and provides reactive breakpoint states
 *
 * @param target - Ref to the target element or CSS selector string
 * @param options - Configuration options for breakpoints
 * @returns Reactive width and breakpoint states
 */
export function useContainerWidth(
  target: Ref<HTMLElement | null> | string,
  options: UseContainerWidthOptions = {},
): UseContainerWidthReturn {
  const { narrowBreakpoint = 768, mobileBreakpoint = 600 } = options

  const width = ref<number>(0)
  const isNarrow = ref<boolean>(false)
  const isMobile = ref<boolean>(false)

  let resizeObserver: ResizeObserver | null = null
  let targetElement: HTMLElement | null = null

  const updateWidth = () => {
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect()
      width.value = rect.width
      isNarrow.value = rect.width < narrowBreakpoint
      isMobile.value = rect.width < mobileBreakpoint
    }
  }

  const setupObserver = () => {
    if (!targetElement) return

    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: newWidth } = entry.contentRect
        width.value = newWidth
        isNarrow.value = newWidth < narrowBreakpoint
        isMobile.value = newWidth < mobileBreakpoint
      }
    })

    resizeObserver.observe(targetElement)
    // Initial measurement
    updateWidth()
  }

  const cleanup = () => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
  }

  onMounted(() => {
    // Handle both ref and string selector cases
    if (typeof target === 'string') {
      const element = document.querySelector(target)
      // Narrow Element to HTMLElement
      targetElement = element instanceof HTMLElement ? element : null
    } else {
      targetElement = target.value
    }

    if (targetElement) {
      setupObserver()
    } else if (typeof target !== 'string') {
      // If target is a ref, watch for changes
      // Declare stopWatching before watchEffect to avoid TDZ
      let stopWatching: (() => void) | null = null
      stopWatching = watchEffect(() => {
        if (target.value) {
          targetElement = target.value
          cleanup()
          setupObserver()
          // Stop watching after element is found
          if (stopWatching) {
            stopWatching()
          }
        }
      })
    }
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    width,
    isNarrow,
    isMobile,
    updateWidth,
  }
}
