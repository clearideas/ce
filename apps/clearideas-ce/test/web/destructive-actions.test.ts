import { createTestingPinia } from '@pinia/testing'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SiteItemMenu from '../../src-web/src/components/sites/menuItems/SiteItemMenu.vue'
import { mountWithVuetify, settle } from './harness'

const {
  deleteContent,
  site,
  sites,
  suppressedSites,
  suppressSiteInvitation,
  alertAdd,
  alertAddWithAction,
  updateProfile,
} = vi.hoisted(() => ({
  deleteContent: vi.fn(),
  site: vi.fn(),
  sites: vi.fn(),
  suppressedSites: vi.fn(),
  suppressSiteInvitation: vi.fn(),
  alertAdd: vi.fn(),
  alertAddWithAction: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock('../../src-web/src/api/client', () => ({
  ceApi: { deleteContent, site, sites, suppressedSites, suppressSiteInvitation, updateProfile },
}))
vi.mock('../../src-web/src/composables/useAlert', () => ({
  useAlert: () => ({ add: alertAdd, addWithAction: alertAddWithAction }),
  updateAlertTheme: vi.fn(),
}))

import { useContentStore } from '../../src-web/src/stores/content.store'
import { useSiteStore } from '../../src-web/src/stores/site.store'

const siteDetail = {
  id: 'site-1',
  name: 'Client Documents',
  currentUserRole: 'owner',
  folders: [],
  files: Array.from({ length: 6 }, (_, i) => ({
    id: `f${i + 1}`,
    name: `File ${i + 1}`,
    key: `f${i + 1}`,
    contentType: 'text/plain',
  })),
}

describe('bulk delete (plan item 3.5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sites.mockResolvedValue({ sites: [siteDetail] })
    site.mockResolvedValue({ site: siteDetail })
  })

  it('deletes in batches, reports progress, refreshes once and summarises', async () => {
    deleteContent.mockResolvedValue({})
    const siteStore = useSiteStore()
    await siteStore.setCurrentSite('site-1')
    const contentStore = useContentStore()
    const progress: Array<[number, number]> = []

    const result = await contentStore.deleteContents('site-1', ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], (c, t) =>
      progress.push([c, t]),
    )

    expect(deleteContent).toHaveBeenCalledTimes(6)
    expect(progress).toEqual([
      [0, 6],
      [4, 6],
      [6, 6],
    ]) // batches of 4
    expect(site).toHaveBeenCalledTimes(2) // once for setCurrentSite, once after the batch — not per item
    expect(result.deleted).toHaveLength(6)
    expect(result.failed).toEqual([])
    expect(alertAdd).toHaveBeenCalledWith(
      expect.objectContaining({ message: '6 items deleted.', type: 'success' }),
    )
  })

  it('keeps going after a failure and names what could not be deleted', async () => {
    deleteContent.mockImplementation(async (_siteId: string, id: string) => {
      if (id === 'f2') throw new Error('locked')
    })
    const siteStore = useSiteStore()
    await siteStore.setCurrentSite('site-1')
    const contentStore = useContentStore()

    const result = await contentStore.deleteContents('site-1', ['f1', 'f2', 'f3'])
    expect(result.deleted).toEqual(['f1', 'f3'])
    expect(result.failed.map(f => f.id)).toEqual(['f2'])
    expect(alertAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('2 deleted, 1 could not be deleted: File 2'),
      }),
    )
  })
})

describe('block site (plan item 3.5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sites.mockResolvedValue({ sites: [siteDetail] })
    suppressedSites.mockResolvedValue({ sites: [] })
    suppressSiteInvitation.mockResolvedValue({})
  })

  it('offers Undo on the success toast, and Undo unblocks', async () => {
    const siteStore = useSiteStore()
    await siteStore.getSites()
    updateProfile.mockResolvedValue({
      profile: { id: 'u', email: 'e', attributes: { sites: { suppressedSites: [] } } },
    })

    await siteStore.suppressSiteInvitation('site-1')
    expect(suppressSiteInvitation).toHaveBeenCalledWith('site-1')
    expect(alertAddWithAction).toHaveBeenCalledTimes(1)
    const [toast, action] = alertAddWithAction.mock.calls[0]
    expect(toast.message).toBe('"Client Documents" blocked.')
    expect(action.label).toBe('Undo')

    await action.onAction()
    expect(updateProfile).toHaveBeenCalledTimes(1) // unblock writes the profile's suppressed list
  })

  it('asks for confirmation before blocking from the row menu', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
    const siteStore = useSiteStore(pinia)
    siteStore.sites = [siteDetail]
    const wrapper = await mountWithVuetify(SiteItemMenu, {
      props: { siteId: 'site-1' },
      global: { plugins: [pinia] },
    })

    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    await settle()
    const blockItem = [...document.body.querySelectorAll('.v-list-item')].find(el =>
      el.textContent?.includes('Block site'),
    )
    ;(blockItem as HTMLElement).click()
    await settle()
    expect(siteStore.suppressSiteInvitation).not.toHaveBeenCalled()
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Block “Client Documents”?')

    const confirm = [...dialog!.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Block')
    confirm!.click()
    await settle()
    expect(siteStore.suppressSiteInvitation).toHaveBeenCalledWith('site-1')
  })
})
