import { beforeEach, describe, expect, it, vi } from 'vitest'
import { byText, mountApp, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoA11yViolations, expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — a site's Content tab (SiteView, ContentActions, ContentList/ContentTiles,
 * Breadcrumbs, FolderDialog, DeleteSelectedDialog, ContentItemMenu, DropZone, SortContent) through
 * the real app, stores and router against the fake backend.
 */
let backend: FakeBackend
const uploads: Array<{ method: string; url: string; contentType: string | null; name: string }> = []

/** Minimal XHR for `contentStore.putUploadBody`: records the PUT and answers 200. */
class FakeXhr {
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 0
  responseText = ''
  withCredentials = false
  private method = ''
  private url = ''
  private headers: Record<string, string> = {}
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }
  send(body: File) {
    uploads.push({
      method: this.method,
      url: this.url,
      contentType: this.headers['content-type'] ?? null,
      name: body.name,
    })
    this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size } as ProgressEvent)
    this.status = 200
    queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => {
  window.localStorage.clear()
  uploads.length = 0
  backend = installFakeBackend()
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

/** The name in each content row: its link (the tag chips share the title cell). */
const rowNames = () =>
  queryAll('.site-pane tbody tr .title').map(title =>
    (title.querySelector('a.item-link') ?? title).textContent?.trim(),
  )
const tileNames = () => queryAll('.content-tile-item .title').map(el => el.textContent?.trim())

async function openHandbook(path = `/site/${ID.handbook}`) {
  const app = await mountApp(path)
  await waitFor(() => expect(rowNames().length).toBeGreaterThan(0))
  return app
}

describe('Site content', () => {
  it('shows the site heading, tags, tabs for an owner, and files before folders', async () => {
    const { wrapper } = await openHandbook()
    expect(rowNames()).toEqual(['welcome.md', 'Roadmap.pdf', 'Policies', 'Archive'])
    expect(document.title).toBe('Product Handbook · Clear Ideas CE')
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual([
      'Content',
      'AI',
      'Users',
      'Settings',
    ])
    const tags = wrapper.find('.site-tags').text()
    expect(tags).toContain('Private')
    expect(tags).toContain('Owned')
    expect(tags).toContain('docs')
    // File tags render in the row.
    expect(queryAll('.site-pane tbody tr')[1].textContent).toContain('planning')
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').text()).toContain('Product Handbook')
    expect(backend.unhandled).toEqual([])
  })

  it('opens a folder from its row and shows its content and breadcrumb', async () => {
    const { wrapper, router } = await openHandbook()
    queryAll('.site-pane tbody tr')
      .find(row => row.textContent?.includes('Policies'))!
      .click()
    await waitFor(() =>
      expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/${ID.policies}/content`),
    )
    await waitFor(() => expect(rowNames()).toEqual(['Leave policy.pdf', 'Travel.docx']))
    await waitFor(() => expect(wrapper.find('nav[aria-label="Breadcrumb"]').text()).toContain('Policies'))
  })

  it('names are links (keyboard/screen-reader path): files to the viewer, folders to their content', async () => {
    const { router } = await openHandbook()
    const link = (name: string) =>
      queryAll('.site-pane tbody tr a.item-link').find(a => a.textContent?.trim() === name)!
    expect(link('Roadmap.pdf').getAttribute('href')).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`)
    expect(link('Policies').getAttribute('href')).toBe(`/site/${ID.handbook}/${ID.policies}/content`)
    link('Roadmap.pdf').click()
    await waitFor(() =>
      expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`),
    )
  })

  it('in tiles each tile is one link; its checkbox and menu do not open it', async () => {
    window.localStorage.setItem('ci-ui-preferences', JSON.stringify({ tileView: true }))
    const app = await mountApp(`/site/${ID.handbook}`)
    await waitFor(() => expect(tileNames().length).toBeGreaterThan(0))
    const tile = queryAll('.content-tile-item').find(el => el.textContent?.includes('Roadmap.pdf'))!
    tile.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    await settle()
    expect(app.router.currentRoute.value.path).toBe(`/site/${ID.handbook}`)
    const link = tile.querySelector<HTMLAnchorElement>('a.item-link--stretched')!
    expect(link.textContent?.trim()).toBe('Roadmap.pdf')
    link.click()
    await waitFor(() =>
      expect(app.router.currentRoute.value.path).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`),
    )
  })

  it('a site that does not exist (or is no longer shared) says so, instead of an empty site', async () => {
    const { wrapper, router } = await mountApp('/site/660000000000000000000999')
    await waitFor(() => expect(document.body.textContent).toContain('This site is not available'))
    expect(document.body.textContent).not.toContain('No content yet')
    expect(document.title).toBe('Site not available · Clear Ideas CE')
    byText<HTMLAnchorElement>('a', 'Back to sites')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/sites'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('a server error while opening a site is retryable', async () => {
    backend.failNext('GET', `/api/sites/${ID.handbook}`, 500, { error: 'Database unavailable' })
    await mountApp(`/site/${ID.handbook}`)
    await waitFor(() => expect(document.body.textContent).toContain('Database unavailable'))
    byText<HTMLButtonElement>('button', 'Retry')!.click()
    await waitFor(() => expect(rowNames()).toEqual(['welcome.md', 'Roadmap.pdf', 'Policies', 'Archive']))
  })

  it('shows the full folder trail in the breadcrumb for nested folders', async () => {
    const { wrapper } = await openHandbook(`/site/${ID.handbook}/${ID.archive2024}/content`)
    expect(rowNames()).toEqual(['Old plan.pdf'])
    const crumbs = () => wrapper.findAll('nav[aria-label="Breadcrumb"] li').map(li => li.text())
    await waitFor(() => expect(crumbs()).toEqual(['Product Handbook', 'Archive', '2024']))
    const links = wrapper.findAll('nav[aria-label="Breadcrumb"] a')
    expect(links.at(-1)!.attributes('aria-current')).toBe('page')
    expect(links[1].attributes('href')).toBe(`/site/${ID.handbook}/${ID.archive}`)

    // Back at the site root the trail is just the site (no stale folder crumbs).
    await wrapper.vm.$router.push(`/site/${ID.handbook}`)
    await waitFor(() => expect(crumbs()).toEqual(['Product Handbook']))
  })

  it('lists a folder’s child folders before its files', async () => {
    await openHandbook(`/site/${ID.handbook}/${ID.archive}/content`)
    expect(rowNames()).toEqual(['2024'])
  })

  it('creates a folder in the current folder', async () => {
    const { wrapper } = await openHandbook(`/site/${ID.handbook}/${ID.policies}/content`)
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'New folder')!
      .trigger('click')
    const input = await waitFor(() => document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!)
    input.value = 'Contracts'
    input.dispatchEvent(new Event('input'))
    await settle()
    byText<HTMLButtonElement>('[role="dialog"] button', 'Create folder')!.click()

    await waitFor(() => expect(backend.calls('POST', `/api/sites/${ID.handbook}/folders`)).toHaveLength(1))
    expect(backend.calls('POST', `/api/sites/${ID.handbook}/folders`)[0].body).toEqual({
      name: 'Contracts',
      folderId: ID.policies,
    })
    await waitFor(() => expect(rowNames()).toContain('Contracts'))
  })

  it('selects two files and deletes them after confirmation', async () => {
    const { wrapper, router } = await openHandbook()
    await wrapper.get('[aria-label="Select welcome.md"]').trigger('click')
    await wrapper.get('[aria-label="Select Roadmap.pdf"]').trigger('click')
    // Ticking a row selects it; it must not also open the file (the row click navigates).
    await settle()
    expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}`)
    const deleteButton = await waitFor(() => wrapper.get('button[aria-label="Delete 2 items"]'))
    await deleteButton.trigger('click')
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('delete 2 items')
    expect(backend.calls('DELETE', /\/content\//)).toHaveLength(0)

    byText<HTMLButtonElement>('[role="dialog"] button', 'Delete')!.click()
    await waitFor(() =>
      expect(backend.calls('DELETE', new RegExp(`/api/site/${ID.handbook}/content/`))).toHaveLength(2),
    )
    await waitFor(() => expect(rowNames()).toEqual(['Policies', 'Archive']))
    expect(wrapper.find('button[aria-label="Delete 2 items"]').exists()).toBe(false) // selection cleared
  })

  it('"select all" selects every visible item', async () => {
    const { wrapper } = await openHandbook()
    await wrapper.get('[aria-label="Select all items"]').trigger('click')
    await waitFor(() => expect(wrapper.find('button[aria-label="Delete 4 items"]').exists()).toBe(true))
  })

  it('renames a file from its row menu', async () => {
    const { wrapper } = await openHandbook()
    await wrapper.get('button[aria-label="More actions for welcome.md"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Rename')!.click()
    const input = await waitFor(() => {
      const el = document.body.querySelector<HTMLInputElement>('[role="dialog"] input')
      expect(el?.value).toBe('welcome.md')
      return el!
    })
    input.value = 'README.md'
    input.dispatchEvent(new Event('input'))
    await settle()
    byText<HTMLButtonElement>('[role="dialog"] button', 'Rename')!.click()
    await waitFor(() =>
      expect(backend.calls('PUT', `/api/site/${ID.handbook}/content/${ID.welcome}`)).toHaveLength(1),
    )
    expect(backend.calls('PUT', `/api/site/${ID.handbook}/content/${ID.welcome}`)[0].body).toEqual({
      name: 'README.md',
    })
    await waitFor(() => expect(rowNames()).toContain('README.md'))
  })

  it('deletes a single item from its row menu after confirmation', async () => {
    const { wrapper } = await openHandbook()
    await wrapper.get('button[aria-label="More actions for Roadmap.pdf"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Delete')!.click()
    await settle()
    expect(backend.calls('DELETE', /content/)).toHaveLength(0)
    byText<HTMLButtonElement>('[role="dialog"] button', 'Delete')!.click()
    await waitFor(() =>
      expect(backend.calls('DELETE', `/api/site/${ID.handbook}/content/${ID.roadmap}`)).toHaveLength(1),
    )
    await waitFor(() => expect(rowNames()).not.toContain('Roadmap.pdf'))
  })

  it('sorts by name and keeps the order when switching to tiles', async () => {
    const { wrapper } = await openHandbook()
    await wrapper.get('button[aria-label^="Sort: Manual order"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Name')!.click()
    await waitFor(() => expect(rowNames()).toEqual(['Archive', 'Policies', 'Roadmap.pdf', 'welcome.md']))

    await wrapper.get('button[aria-label^="View:"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Tiles')!.click()
    await waitFor(() => expect(tileNames()).toEqual(['Archive', 'Policies', 'Roadmap.pdf', 'welcome.md']))
  })

  it('uploads a file dropped on the Upload button into the current folder', async () => {
    const { wrapper } = await openHandbook(`/site/${ID.handbook}/${ID.policies}/content`)
    const button = wrapper.get('button[aria-label="Upload files"]').element
    const dropped = new File(['# Notes'], 'notes.md', { type: '' })
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          files: [dropped],
          items: [{ kind: 'file', type: '' }],
          types: ['Files'],
          dropEffect: 'copy',
        },
      })
      button.dispatchEvent(event)
    }

    await waitFor(() => expect(backend.calls('POST', '/api/files/upload-target')).toHaveLength(1))
    expect(backend.calls('POST', '/api/files/upload-target')[0].body).toEqual({
      siteId: ID.handbook,
      folderId: ID.policies,
      fileName: 'notes.md',
      contentType: 'text/markdown', // inferred from the extension when the browser gives none
      size: dropped.size,
    })
    await waitFor(() => expect(uploads).toHaveLength(1))
    expect(uploads[0]).toMatchObject({ method: 'PUT', contentType: 'text/markdown', name: 'notes.md' })
    await waitFor(() => expect(rowNames()).toContain('notes.md'))
  })

  it('shows the empty state with Upload and New folder in an empty site', async () => {
    const { wrapper } = await mountApp(`/site/${ID.wiki}`)
    await waitFor(() => expect(wrapper.text()).toContain('No content yet'))
    const actions = wrapper.findAll('.v-empty-state button').map(b => b.text())
    expect(actions).toEqual(expect.arrayContaining(['Upload files', 'New folder']))
    await expectNoA11yViolations(wrapper)
  })

  it('a viewer sees no Users/Settings tabs, no selection and no upload or folder actions', async () => {
    const { wrapper } = await mountApp(`/site/${ID.partner}`)
    await waitFor(() => expect(rowNames()).toEqual(['NDA.pdf']))
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['Content'])
    expect(wrapper.find('[aria-label="Select NDA.pdf"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Upload files"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some(b => b.text() === 'New folder')).toBe(false)
    expect(wrapper.find('.site-tags').text()).toContain('Shared')
    // Viewers cannot download either.
    await wrapper.get('button[aria-label="More actions for NDA.pdf"]').trigger('click')
    await settle()
    expect(byText('.v-list-item', 'Download')).toBeUndefined()
    expect(byText('.v-list-item', 'Rename')).toBeUndefined()
  })

  it('redirects an unknown tab to the content tab', async () => {
    const { router } = await mountApp(`/site/${ID.partner}/settings`)
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/site/${ID.partner}/content`))
  })

  it('loads the site detail once per navigation', async () => {
    await openHandbook()
    expect(backend.calls('GET', `/api/sites/${ID.handbook}`)).toHaveLength(1)
  })
})
