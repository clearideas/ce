import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PageHeader from '../../src-web/src/components/base/PageHeader.vue'
import Breadcrumbs from '../../src-web/src/components/sites/Breadcrumbs.vue'
import { useContentStore } from '../../src-web/src/stores/content.store'
import { useSiteStore } from '../../src-web/src/stores/site.store'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

describe('PageHeader / usePageTitle (review finding A3)', () => {
  it('renders a page heading (visually hidden by default) and sets document.title', async () => {
    const wrapper = await mountWithVuetify(PageHeader, { props: { title: 'Sites' } })
    const h1 = wrapper.find('h1')
    expect(h1.text()).toBe('Sites')
    expect(h1.classes()).toContain('d-sr-only')
    expect(document.title).toBe('Sites · Clear Ideas CE')

    await wrapper.setProps({ title: 'Users' })
    await nextTick()
    expect(document.title).toBe('Users · Clear Ideas CE')
  })

  it('can show the heading with actions, and lets documentTitle differ from the heading', async () => {
    const wrapper = await mountWithVuetify(PageHeader, {
      props: { title: 'Settings: Profile', documentTitle: 'Settings', visible: true },
      slots: { actions: '<button type="button">New</button>' },
    })
    expect(wrapper.find('h1').classes()).not.toContain('d-sr-only')
    expect(wrapper.find('.page-header__actions button').exists()).toBe(true)
    expect(document.title).toBe('Settings · Clear Ideas CE')
    await expectNoA11yViolations(wrapper)
  })
})

describe('Breadcrumbs', () => {
  it('is a navigation landmark with an ordered list and aria-current on the last item', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
    const siteStore = useSiteStore(pinia)
    const contentStore = useContentStore(pinia)
    siteStore.sites = [{ id: 'site-1', name: 'Client Documents', folders: [] }]
    siteStore.currentSiteId = 'site-1'
    contentStore.ancestors = [
      { id: 'folder-1', name: 'Contracts', kind: 'folder' },
      { id: 'file-1', name: 'NDA.pdf', kind: 'file' },
    ]

    const stub = { template: '<div />' }
    const wrapper = await mountWithVuetify(Breadcrumbs, {
      props: { siteId: 'site-1' },
      global: { plugins: [pinia] },
      routes: [
        { path: '/sites', name: 'sites', component: stub },
        { path: '/site/:siteId/file/:fileId', name: 'file', component: stub },
        { path: '/site/:siteId/:folderId?', name: 'site', component: stub },
      ],
    })

    const nav = wrapper.find('nav[aria-label="Breadcrumb"]')
    expect(nav.exists()).toBe(true)
    const items = nav.findAll('ol > li')
    expect(items.map(item => item.text().trim())).toEqual(['Client Documents', 'Contracts', 'NDA.pdf'])
    expect(items[2].find('a').attributes('aria-current')).toBe('page')
    expect(items[0].find('a').attributes('aria-current')).toBeUndefined()
    await expectNoA11yViolations(wrapper)
  })
})
