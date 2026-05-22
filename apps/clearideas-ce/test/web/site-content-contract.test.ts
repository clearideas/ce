import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContentStore } from '../../src-web/src/stores/content.store'
import { useSiteStore } from '../../src-web/src/stores/site.store'

const { sites, site, updateSite, alertAdd } = vi.hoisted(() => ({
  sites: vi.fn(),
  site: vi.fn(),
  updateSite: vi.fn(),
  alertAdd: vi.fn(),
}))

vi.mock('../../src-web/src/api/client', () => ({
  ceApi: {
    sites,
    site,
    updateSite,
  },
}))

vi.mock('../../src-web/src/composables/useAlert', () => ({
  useAlert: () => ({ add: alertAdd }),
}))

describe('CE site/content store contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sites.mockReset()
    site.mockReset()
    updateSite.mockReset()
    alertAdd.mockReset()
  })

  it('loads lean site list data first and selected-site content from the site detail endpoint', async () => {
    sites.mockResolvedValue({
      sites: [
        {
          id: 'site-1',
          name: 'Test Site',
          currentUserRole: 'owner',
          folders: [],
          files: [],
        },
      ],
    })
    site.mockResolvedValue({
      site: {
        id: 'site-1',
        name: 'Test Site',
        currentUserRole: 'owner',
        files: [
          {
            id: 'file-root',
            name: 'root.md',
            key: 'root.md',
            contentType: 'text/markdown',
            uploadedAt: '2026-05-20T00:00:00.000Z',
          },
        ],
        folders: [
          {
            id: 'folder-1',
            name: 'Folder',
            files: [
              {
                id: 'file-child',
                name: 'child.json',
                key: 'child.json',
                contentType: 'application/json',
                uploadedAt: '2026-05-20T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    })

    const siteStore = useSiteStore()
    const contentStore = useContentStore()

    await siteStore.getSites()
    expect(contentStore.contents).toHaveLength(0)

    await siteStore.setCurrentSite('site-1')
    expect(site).toHaveBeenCalledWith('site-1')
    expect(contentStore.contents.map(item => item.id)).toEqual(['file-root', 'folder-1'])
    expect(contentStore.contents[0]).toMatchObject({
      viewUrl: '/api/files/view/file-root',
      downloadUrl: '/api/files/download/file-root',
    })

    contentStore.activeFolderId = 'folder-1'
    expect(contentStore.contents.map(item => item.id)).toEqual(['file-child'])
    expect(contentStore.contents[0]).toMatchObject({
      viewUrl: '/api/files/view/file-child',
      downloadUrl: '/api/files/download/file-child',
    })
  })

  it('surfaces updateCurrentSite success and validation errors through alerts', async () => {
    const siteStore = useSiteStore()
    siteStore.currentSiteId = 'site-1'
    updateSite.mockResolvedValueOnce({
      site: {
        id: 'site-1',
        name: 'Test Site',
        attributes: { ai: { chatEnabled: true } },
      },
    })

    await siteStore.updateCurrentSite({ attributes: { ai: { chatEnabled: true } } })

    expect(updateSite).toHaveBeenCalledWith('site-1', { attributes: { ai: { chatEnabled: true } } })
    expect(alertAdd).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Site settings saved.',
      type: 'success',
    }))

    updateSite.mockRejectedValueOnce(new Error('"attributes" is invalid'))
    await expect(siteStore.updateCurrentSite({ attributes: {} })).rejects.toThrow('"attributes" is invalid')
    expect(alertAdd).toHaveBeenCalledWith(expect.objectContaining({
      message: '"attributes" is invalid',
      type: 'error',
    }))
  })

  it('sends an explicit media clear request and removes the cached site icon', async () => {
    const siteStore = useSiteStore()
    siteStore.currentSiteId = 'site-1'
    siteStore.sites = [{
      id: 'site-1',
      name: 'Test Site',
      folders: [],
      attributes: {
        media: {
          icon: { dataUrl: 'data:image/png;base64,old-icon' },
        },
      },
    }]
    siteStore.siteDetails = {
      'site-1': {
        id: 'site-1',
        name: 'Test Site',
        folders: [],
        attributes: {
          media: {
            icon: { dataUrl: 'data:image/png;base64,old-icon' },
          },
        },
      },
    }
    updateSite.mockResolvedValueOnce({
      site: {
        id: 'site-1',
        name: 'Test Site',
        folders: [],
        attributes: {
          media: {
            icon: null,
          },
        },
      },
    })

    await siteStore.deleteMedia('icon')

    expect(updateSite).toHaveBeenCalledWith('site-1', {
      attributes: {
        media: {
          icon: null,
        },
      },
    })
    expect(siteStore.currentSite?.attributes?.media?.icon).toBeUndefined()
  })
})
