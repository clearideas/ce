import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, type Component } from 'vue'
import ContentList from '../../src-web/src/components/content/ContentList.vue'
import ContentTiles from '../../src-web/src/components/content/ContentTiles.vue'
import SortContent from '../../src-web/src/components/content/actions/SortContent.vue'
import {
  createContentFilterState,
  provideContentFilters,
  type ContentFilterState,
} from '../../src-web/src/composables/useContentFilters'
import { usePreferencesStore } from '../../src-web/src/stores/preferences.store'
import { useSiteStore } from '../../src-web/src/stores/site.store'
import { mountWithVuetify, settle } from './harness'

vi.mock('../../src-web/src/api/client', () => ({ ceApi: {}, api: {} }))

const files = Array.from({ length: 12 }, (_, i) => ({
  id: `f${i + 1}`,
  name: `File ${String(i + 1).padStart(2, '0')}.pdf`,
  key: `f${i + 1}`,
  contentType: 'application/pdf',
  size: (12 - i) * 100,
  uploadedAt: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
}))

/** Mount a content view inside a provider for the given shared filter state. */
async function mountWithFilters(view: Component, filters: ContentFilterState, pageSize = 25) {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
  const siteStore = useSiteStore(pinia)
  siteStore.sites = [{ id: 'site-1', name: 'Site', currentUserRole: 'owner', folders: [], files }]
  siteStore.currentSiteId = 'site-1'
  usePreferencesStore(pinia).preferences.sitePageSize = pageSize as never

  const Host = defineComponent({
    setup() {
      provideContentFilters(filters)
      return () => h(view, { siteId: 'site-1' })
    },
  })
  const stub = { template: '<div />' }
  const wrapper = await mountWithVuetify(Host, {
    global: { plugins: [pinia] },
    routes: [
      { path: '/site/:siteId/file/:fileId', name: 'file', component: stub },
      { path: '/site/:siteId/:folderId/:siteTab', name: 'site-folder-tab', component: stub },
    ],
  })
  await settle()
  return wrapper
}

const namesIn = (wrapper: { findAll: (s: string) => Array<{ text: () => string }> }, selector: string) =>
  wrapper.findAll(selector).map(el => el.text().trim())

describe('list / tile parity (plan item 3.3)', () => {
  it('shows the same items in the same order for the same shared sort state', async () => {
    const filters = createContentFilterState()
    filters.sortKey = 'size'
    filters.sortOrder = 'asc'

    const list = await mountWithFilters(ContentList, filters)
    const tiles = await mountWithFilters(ContentTiles, filters)
    const listNames = namesIn(list, 'tbody .content-item .title')
    const tileNames = namesIn(tiles, '.content-tile-item .title')
    expect(listNames).toHaveLength(12)
    expect(tileNames).toEqual(listNames)
    expect(listNames[0]).toBe('File 12.pdf') // smallest first
  })

  it('paginates the tile view with the same page size as the list', async () => {
    const filters = createContentFilterState()
    const tiles = await mountWithFilters(ContentTiles, filters, 10)
    expect(tiles.findAll('.content-tile-item')).toHaveLength(10)
    expect(tiles.text()).toContain('Items 1 to 10 of 12')
    await tiles.find('button[aria-label="Next page"]').trigger('click')
    await nextTick()
    expect(tiles.findAll('.content-tile-item')).toHaveLength(2)
  })

  it('SortContent drives the shared state and announces the current sort', async () => {
    const filters = createContentFilterState()
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
    const Host = defineComponent({
      setup() {
        provideContentFilters(filters)
        return () => h(SortContent)
      },
    })
    const wrapper = await mountWithVuetify(Host, { global: { plugins: [pinia] } })
    const button = wrapper.find('button')
    expect(button.attributes('aria-label')).toBe('Sort: Manual order, ascending')
    await button.trigger('click')
    await settle()
    const nameOption = [...document.body.querySelectorAll('.v-list-item')].find(el =>
      el.textContent?.includes('Name'),
    )
    ;(nameOption as HTMLElement).click()
    await settle()
    expect(filters.sortKey).toBe('name')
    expect(filters.sortOrder).toBe('asc')
    expect(wrapper.find('button').attributes('aria-label')).toBe('Sort: Name, ascending')
  })
})
