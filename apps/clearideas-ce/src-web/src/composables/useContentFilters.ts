import { computed, inject, provide, reactive, type InjectionKey } from 'vue'

/**
 * Filter + sort state for a site's content, shared by the toolbar (`ContentActions`) and both
 * views (`ContentList`, `ContentTiles`) through provide/inject so that switching between list and
 * tiles keeps the same ordering and the same (future) filters.
 *
 * `SiteView` calls `provideContentFilters()`; descendants call `useContentFilters()`. Outside a
 * provider (tests, isolated use) `useContentFilters()` returns its own local state.
 */
export type ContentSortKey = 'rank' | 'name' | 'size' | 'updatedAt'
export type SortOrder = 'asc' | 'desc'

export interface ContentFilterState {
  sortKey: ContentSortKey
  sortOrder: SortOrder
  nameFilterType: 'contains' | 'startsWith'
  nameFilterValue: string
  mimeTypes: string[]
  sizeOperator: 'gt' | 'lt'
  /** Kilobytes, as typed by the user. */
  sizeValue: string
  updatedOperator: 'before' | 'after'
  /** ISO date (yyyy-mm-dd). */
  updatedDate: string
}

/** The minimal shape the filters need; list/tile items and store items all satisfy it. */
export interface FilterableContent {
  id: string
  name?: string
  kind?: string
  contentType?: string
  size?: number | null
  rank?: number | null
  updatedAt?: string | null
}

export const SORT_OPTIONS: ReadonlyArray<{ value: ContentSortKey; title: string }> = [
  { value: 'rank', title: 'Manual order' },
  { value: 'name', title: 'Name' },
  { value: 'size', title: 'Size' },
  { value: 'updatedAt', title: 'Last updated' },
]

/**
 * The [start, end] of a calendar day typed as `yyyy-mm-dd`, in the user's local time zone.
 * (`new Date('yyyy-mm-dd')` parses as UTC midnight, which is the previous day west of UTC.)
 */
export function parseLocalDay(value: string): { start: number; end: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [year, month, dayOfMonth] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const start = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0)
  if (start.getMonth() !== month - 1 || start.getDate() !== dayOfMonth) return null
  return { start: start.getTime(), end: new Date(year, month - 1, dayOfMonth, 23, 59, 59, 999).getTime() }
}

export function createContentFilterState(): ContentFilterState {
  return reactive({
    sortKey: 'rank',
    sortOrder: 'asc',
    nameFilterType: 'contains',
    nameFilterValue: '',
    mimeTypes: [],
    sizeOperator: 'gt',
    sizeValue: '',
    updatedOperator: 'after',
    updatedDate: '',
  })
}

export function resetContentFilters(state: ContentFilterState) {
  Object.assign(state, createContentFilterState())
}

export function hasActiveContentFilters(state: ContentFilterState): boolean {
  return Boolean(
    state.nameFilterValue.trim() ||
    state.mimeTypes.length ||
    state.sizeValue.trim() ||
    state.updatedDate.trim(),
  )
}

export function applyContentFilters<T extends FilterableContent>(
  items: readonly T[],
  state: ContentFilterState,
): T[] {
  const name = state.nameFilterValue.trim().toLowerCase()
  const mimeTypes = state.mimeTypes.map(type => String(type).trim().toLowerCase()).filter(Boolean)
  const sizeText = state.sizeValue.trim()
  const parsedSize = Number(sizeText)
  const sizeBytes =
    sizeText.length > 0 && Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize * 1024 : null
  const day = parseLocalDay(state.updatedDate)
  const dayStart = day?.start ?? null
  const dayEnd = day?.end ?? null

  return items.filter(item => {
    if (name) {
      const itemName = (item.name ?? '').toLowerCase()
      if (!(state.nameFilterType === 'startsWith' ? itemName.startsWith(name) : itemName.includes(name)))
        return false
    }
    if (mimeTypes.length > 0) {
      const contentType = String(item.contentType ?? '').toLowerCase()
      if (!contentType || !mimeTypes.includes(contentType)) return false
    }
    if (sizeBytes !== null) {
      const size = Number(item.size ?? NaN)
      if (!Number.isFinite(size)) return false
      if (state.sizeOperator === 'gt' && !(size > sizeBytes)) return false
      if (state.sizeOperator === 'lt' && !(size < sizeBytes)) return false
    }
    if (dayStart !== null && dayEnd !== null) {
      const updated = new Date(item.updatedAt ?? '').getTime()
      if (!Number.isFinite(updated)) return false
      if (state.updatedOperator === 'before' && updated >= dayEnd) return false
      if (state.updatedOperator === 'after' && updated <= dayStart) return false
    }
    return true
  })
}

export function sortContent<T extends FilterableContent>(
  items: readonly T[],
  state: ContentFilterState,
): T[] {
  const direction = state.sortOrder === 'desc' ? -1 : 1
  const compare = (a: T, b: T): number => {
    switch (state.sortKey) {
      case 'name':
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      case 'size':
        return Number(a.size ?? 0) - Number(b.size ?? 0)
      case 'updatedAt':
        return new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()
      default:
        return Number(a.rank ?? 0) - Number(b.rank ?? 0)
    }
  }
  return [...items].sort((a, b) => compare(a, b) * direction)
}

export function filterAndSortContent<T extends FilterableContent>(
  items: readonly T[],
  state: ContentFilterState,
): T[] {
  return sortContent(applyContentFilters(items, state), state)
}

const CONTENT_FILTERS_KEY: InjectionKey<ContentFilterState> = Symbol('content-filters')

export function provideContentFilters(state: ContentFilterState = createContentFilterState()) {
  provide(CONTENT_FILTERS_KEY, state)
  return state
}

export function useContentFilters() {
  const state = inject(CONTENT_FILTERS_KEY, null) ?? createContentFilterState()
  const hasActiveFilters = computed(() => hasActiveContentFilters(state))
  /** Vuetify data-table `sort-by` model bound to the shared state (manual order = no table sort). */
  const sortByModel = computed({
    get: () => (state.sortKey === 'rank' ? [] : [{ key: state.sortKey, order: state.sortOrder }]),
    set: (value: Array<{ key: string; order?: boolean | 'asc' | 'desc' }> | undefined) => {
      const first = Array.isArray(value) ? value[0] : undefined
      if (first?.key && ['name', 'size', 'updatedAt'].includes(first.key)) {
        state.sortKey = first.key as ContentSortKey
        state.sortOrder = first.order === 'desc' ? 'desc' : 'asc'
      } else {
        state.sortKey = 'rank'
        state.sortOrder = 'asc'
      }
    },
  })
  function setSort(key: ContentSortKey, order?: SortOrder) {
    if (order) {
      state.sortKey = key
      state.sortOrder = order
      return
    }
    // Same key toggles direction; a new key starts ascending.
    if (state.sortKey === key) state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc'
    else {
      state.sortKey = key
      state.sortOrder = 'asc'
    }
  }
  return { state, hasActiveFilters, sortByModel, setSort, reset: () => resetContentFilters(state) }
}
