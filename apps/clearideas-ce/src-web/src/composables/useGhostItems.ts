import { onMounted, onUnmounted, type Ref, ref, watch } from 'vue'

// Simple debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }) as T
}

interface UseGhostItemsOptions {
  tileWidth: number
  containerSelector: string
  itemCount: Ref<number>
  debounceDelay?: number
}

export function useGhostItems(options: UseGhostItemsOptions) {
  const { tileWidth, containerSelector, itemCount, debounceDelay = 50 } = options
  const ghostCount = ref(0)
  const container = ref<HTMLElement | null>(null)

  const calculateGhosts = (): void => {
    if (!container.value) return

    const containerWidth = container.value.clientWidth
    const itemsPerRow = Math.floor(containerWidth / tileWidth)
    const neededGhosts = itemsPerRow - (itemCount.value % itemsPerRow)
    ghostCount.value = neededGhosts === itemsPerRow ? 0 : neededGhosts
  }

  const debouncedCalculateGhosts = debounce(calculateGhosts, debounceDelay)

  watch(itemCount, () => {
    calculateGhosts()
  })

  onMounted(() => {
    container.value = document.querySelector(containerSelector)
    calculateGhosts() // Initial calculation
    window.addEventListener('resize', debouncedCalculateGhosts)
    new ResizeObserver(() => debouncedCalculateGhosts()).observe(container.value as HTMLElement)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', debouncedCalculateGhosts)
  })

  return {
    ghostCount,
  }
}

export type { UseGhostItemsOptions }






