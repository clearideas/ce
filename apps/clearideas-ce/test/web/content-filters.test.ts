import { describe, expect, it } from 'vitest'
import {
  applyContentFilters,
  createContentFilterState,
  filterAndSortContent,
  hasActiveContentFilters,
  resetContentFilters,
  parseLocalDay,
  sortContent,
} from '../../src-web/src/composables/useContentFilters'

/** 10:00 local time on the given May 2026 day — the filters work in calendar days of the user's zone. */
const localMay = (day: number) => new Date(2026, 4, day, 10, 0, 0).toISOString()

const items = [
  {
    id: 'b',
    name: 'Beta.pdf',
    kind: 'file',
    contentType: 'application/pdf',
    size: 2048,
    rank: 2,
    updatedAt: localMay(2),
  },
  {
    id: 'a',
    name: 'alpha.txt',
    kind: 'file',
    contentType: 'text/plain',
    size: 512,
    rank: 1,
    updatedAt: localMay(3),
  },
  { id: 'c', name: 'Contracts', kind: 'folder', rank: 3, updatedAt: localMay(1) },
  {
    id: 'd',
    name: 'delta10.png',
    kind: 'file',
    contentType: 'image/png',
    size: 4096,
    rank: 4,
    updatedAt: localMay(4),
  },
  {
    id: 'e',
    name: 'delta2.png',
    kind: 'file',
    contentType: 'image/png',
    size: 1024,
    rank: 5,
    updatedAt: localMay(5),
  },
]

describe('content filters (plan item 3.3)', () => {
  it('defaults to manual order with no filters active', () => {
    const state = createContentFilterState()
    expect(hasActiveContentFilters(state)).toBe(false)
    expect(filterAndSortContent(items, state).map(i => i.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it.each([
    ['name', 'asc', ['a', 'b', 'c', 'e', 'd']], // case-insensitive, numeric-aware (delta2 before delta10)
    ['name', 'desc', ['d', 'e', 'c', 'b', 'a']],
    ['size', 'asc', ['c', 'a', 'e', 'b', 'd']], // folders (no size) first
    ['updatedAt', 'desc', ['e', 'd', 'a', 'b', 'c']],
  ] as const)('sorts by %s %s', (sortKey, sortOrder, expected) => {
    const state = createContentFilterState()
    state.sortKey = sortKey
    state.sortOrder = sortOrder
    expect(sortContent(items, state).map(i => i.id)).toEqual(expected)
  })

  it('filters by name (contains / startsWith), mime type, size and date', () => {
    const state = createContentFilterState()
    state.nameFilterValue = 'DELTA'
    expect(applyContentFilters(items, state).map(i => i.id)).toEqual(['d', 'e'])
    state.nameFilterType = 'startsWith'
    state.nameFilterValue = 'eta'
    expect(applyContentFilters(items, state)).toEqual([])

    resetContentFilters(state)
    state.mimeTypes = ['image/png']
    expect(applyContentFilters(items, state).map(i => i.id)).toEqual(['d', 'e'])

    resetContentFilters(state)
    state.sizeOperator = 'gt'
    state.sizeValue = '1' // kB
    expect(applyContentFilters(items, state).map(i => i.id)).toEqual(['b', 'd']) // folders excluded (no size)
    state.sizeOperator = 'lt'
    expect(applyContentFilters(items, state).map(i => i.id)).toEqual(['a'])

    resetContentFilters(state)
    state.updatedOperator = 'after'
    state.updatedDate = '2026-05-03'
    expect(applyContentFilters(items, state).map(i => i.id)).toEqual(['a', 'd', 'e'])
    state.updatedOperator = 'before'
    expect(applyContentFilters(items, state).map(i => i.id)).toEqual(['b', 'a', 'c']) // 'before' is inclusive of the day; input order kept
    expect(hasActiveContentFilters(state)).toBe(true)
  })

  it('treats the typed date as a local calendar day (regression: parsed as UTC midnight, off by one west of UTC)', () => {
    const day = parseLocalDay('2026-05-03')
    expect(day).not.toBeNull()
    expect(new Date(day!.start).getDate()).toBe(3)
    expect(new Date(day!.start).getHours()).toBe(0)
    expect(new Date(day!.end).getDate()).toBe(3)
    expect(new Date(day!.end).getHours()).toBe(23)
    expect(parseLocalDay('2026-02-30')).toBeNull()
    expect(parseLocalDay('not a date')).toBeNull()
    expect(parseLocalDay('')).toBeNull()

    const state = createContentFilterState()
    state.updatedDate = '2026-05-03'
    state.updatedOperator = 'after'
    const onDay = [
      { id: 'start', updatedAt: new Date(2026, 4, 3, 0, 0, 1).toISOString() },
      { id: 'end', updatedAt: new Date(2026, 4, 3, 23, 59, 0).toISOString() },
      { id: 'eve', updatedAt: new Date(2026, 4, 2, 23, 59, 0).toISOString() },
      { id: 'next', updatedAt: new Date(2026, 4, 4, 0, 0, 1).toISOString() },
    ]
    expect(applyContentFilters(onDay, state).map(i => i.id)).toEqual(['start', 'end', 'next'])
    state.updatedOperator = 'before'
    expect(applyContentFilters(onDay, state).map(i => i.id)).toEqual(['start', 'end', 'eve'])
  })

  it('does not mutate the input', () => {
    const state = createContentFilterState()
    state.sortKey = 'name'
    const copy = [...items]
    sortContent(items, state)
    expect(items).toEqual(copy)
  })
})
