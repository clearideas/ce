import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContentStore } from '../../src-web/src/stores/content.store'

const { searchSite, searchAll, alertAdd } = vi.hoisted(() => ({
  searchSite: vi.fn(),
  searchAll: vi.fn(),
  alertAdd: vi.fn(),
}))

vi.mock('../../src-web/src/api/client', () => ({
  ceApi: { searchSite, searchAll, sites: vi.fn(), site: vi.fn() },
}))

vi.mock('../../src-web/src/composables/useAlert', () => ({
  useAlert: () => ({ add: alertAdd }),
}))

type SearchResponse = { results: { id: string; name: string }[] }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('content store search', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    searchSite.mockReset()
    searchAll.mockReset()
    alertAdd.mockReset()
  })

  it('ignores a slower, older response when a newer search has been issued', async () => {
    const store = useContentStore()
    const first = deferred<SearchResponse>()
    const second = deferred<SearchResponse>()
    searchAll.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const firstRun = store.search(undefined, 'inv')
    const secondRun = store.search(undefined, 'invoice')
    expect(store.isSearching).toBe(true)

    // The newer request completes first.
    second.resolve({ results: [{ id: 'new', name: 'invoice.pdf' }] })
    await secondRun
    expect(store.searchResults.map(result => result.id)).toEqual(['new'])
    expect(store.showSearchResults).toBe(true)
    expect(store.isSearching).toBe(false)

    // The stale response must not overwrite the newer results.
    first.resolve({ results: [{ id: 'old', name: 'inventory.txt' }] })
    await firstRun
    expect(store.searchResults.map(result => result.id)).toEqual(['new'])
    expect(store.searchScope).toEqual({ type: 'all', label: 'all sites' })
    expect(store.searchedQuery).toBe('invoice')
  })

  it('surfaces errors from the latest search only and clears results', async () => {
    const store = useContentStore()
    searchSite.mockResolvedValueOnce({ results: [{ id: 'a', name: 'a.txt' }] })
    await store.search('site-1', 'a')
    expect(store.searchResults).toHaveLength(1)
    expect(store.searchScope).toMatchObject({ type: 'site', siteId: 'site-1' })

    searchSite.mockRejectedValueOnce(new Error('q is too long'))
    await expect(store.search('site-1', 'x'.repeat(501))).resolves.toEqual([])
    expect(store.searchResults).toEqual([])
    expect(store.isSearching).toBe(false)
    expect(alertAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'q is too long' }),
    )

    // A failure from a superseded request is ignored entirely.
    alertAdd.mockReset()
    const stale = deferred<SearchResponse>()
    searchSite
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ results: [{ id: 'b', name: 'b.txt' }] })
    const staleRun = store.search('site-1', 'stale')
    await store.search('site-1', 'fresh')
    stale.reject(new Error('network'))
    await staleRun
    expect(store.searchResults.map(result => result.id)).toEqual(['b'])
    expect(alertAdd).not.toHaveBeenCalled()
    expect(store.isSearching).toBe(false)
  })

  it('accepts the legacy `contents` response shape', async () => {
    const store = useContentStore()
    searchAll.mockResolvedValueOnce({ contents: [{ id: 'legacy', name: 'legacy.txt' }] })
    await store.search(undefined, 'legacy')
    expect(store.searchResults.map(result => result.id)).toEqual(['legacy'])
  })
})
