import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { PREFERENCES_STORAGE_KEY } from '../../src-web/src/stores/preferences.store'
import { byText, mountApp, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — navbar search (NavSearchBar + SearchResults drawer) and the file view
 * (FileView, FileViewer → PDFEmbed/CodeEmbed, Properties, FileActions) through the real app
 * against the fake backend. The vendored PDF viewer has its own public-API spec
 * (pdf-viewer.test.ts); here it is replaced by a stub that records what PDFEmbed hands it.
 */
const pdfViewerProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }))

vi.mock('@clearideas/pdf-viewer', () => ({
  BasePDFViewer: defineComponent({
    name: 'BasePDFViewerStub',
    props: ['pdfData', 'initialPage', 'printEnabled', 'rotateEnabled'],
    setup(props) {
      return () => {
        pdfViewerProps.last = { ...props }
        return h(
          'div',
          { class: 'pdf-viewer-stub' },
          `PDF ${(props.pdfData as Uint8Array | null)?.byteLength ?? 0} bytes`,
        )
      }
    },
  }),
}))

let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  pdfViewerProps.last = null
  backend = installFakeBackend()
})

const editor = () => document.body.querySelector<HTMLElement>('[role="search"] [role="textbox"]')!
const resultTitles = () =>
  queryAll('.search-results-item .search-results-item__title').map(el => el.textContent?.trim())

async function search(text: string) {
  await waitFor(() => expect(editor()).not.toBeNull())
  editor().innerHTML = text
  editor().dispatchEvent(new InputEvent('input', { bubbles: true }))
  await settle()
  editor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

describe('Search', () => {
  it('searches all sites from the navbar and lists the results with a summary', async () => {
    const { wrapper } = await mountApp('/sites')
    await search('road')
    await waitFor(() => expect(backend.calls('POST', '/api/search')).toHaveLength(1))
    expect(backend.calls('POST', '/api/search')[0].body).toEqual({ q: 'road' })
    await waitFor(() => expect(resultTitles()).toEqual(['1. Roadmap.pdf']))
    expect(document.body.querySelector('.search-results-summary__context')?.textContent).toContain(
      '1 result in all sites',
    )
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('scopes the search to the current site', async () => {
    await mountApp(`/site/${ID.handbook}`)
    await waitFor(() => expect(editor().getAttribute('aria-label')).toBe('Search Product Handbook'))
    await search('policy')
    await waitFor(() => expect(backend.calls('POST', `/api/site/${ID.handbook}/search`)).toHaveLength(1))
    await waitFor(() => expect(resultTitles()).toEqual(['1. Leave policy.pdf']))
    expect(document.body.querySelector('.search-results-summary__context')?.textContent).toContain(
      'in Product Handbook',
    )
  })

  it('opening a result goes to the file and closes the results', async () => {
    const { router } = await mountApp('/sites')
    await search('road')
    await waitFor(() => expect(resultTitles()).toHaveLength(1))
    queryAll('.search-results-item')[0].click()
    await waitFor(() =>
      expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`),
    )
    await waitFor(() => expect(document.body.querySelector('.search-results-item')).toBeNull())
  })

  it('results are links; Escape closes the panel (from a result or the box) and returns to the box', async () => {
    await mountApp('/sites')
    await search('road')
    await waitFor(() => expect(resultTitles()).toHaveLength(1))
    const result = queryAll('.search-results-item')[0]
    expect(result.tagName).toBe('A')
    expect(result.getAttribute('href')).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`)
    result.focus()
    result.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => expect(document.body.querySelector('.search-results-item')).toBeNull())
    expect(document.activeElement).toBe(editor())

    await search('road')
    await waitFor(() => expect(resultTitles()).toHaveLength(1))
    editor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await waitFor(() => expect(document.body.querySelector('.search-results-item')).toBeNull())
  })

  it('the results panel resizes from the keyboard and remembers its width', async () => {
    await mountApp('/sites')
    await search('road')
    const handle = await waitFor(() => {
      const el = document.body.querySelector<HTMLElement>(
        '[role="separator"][aria-label="Resize search results"]',
      )
      expect(el).not.toBeNull()
      return el!
    })
    expect(handle.getAttribute('aria-valuenow')).toBe('400')
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await settle()
    expect(handle.getAttribute('aria-valuenow')).toBe('432')
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await settle()
    expect(handle.getAttribute('aria-valuenow')).toBe('320')
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}').searchResultsWidth).toBe(
      320,
    )
  })

  it('closes the results with the close button', async () => {
    await mountApp('/sites')
    await search('road')
    await waitFor(() => expect(resultTitles()).toHaveLength(1))
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Close search results"]')!.click()
    await waitFor(() => expect(document.body.querySelector('.search-results-item')).toBeNull())
  })

  it('says so when nothing matched', async () => {
    await mountApp('/sites')
    await search('zzzz')
    await waitFor(() =>
      expect(document.body.querySelector('.search-results-summary__context')?.textContent).toContain(
        '0 results',
      ),
    )
    expect(document.body.textContent).toContain('No results for “zzzz”')
  })
})

describe('File view', () => {
  it('opens a PDF in the viewer with its bytes, breadcrumb and page title', async () => {
    backend.fileBodies[ID.roadmap] = new Uint8Array([37, 80, 68, 70, 45])
    const { wrapper } = await mountApp(`/site/${ID.handbook}/file/${ID.roadmap}`)
    await waitFor(() =>
      expect(document.body.querySelector('.pdf-viewer-stub')?.textContent).toBe('PDF 5 bytes'),
    )
    expect(backend.calls('GET', `/api/site/${ID.handbook}/file/${ID.roadmap}/token`)).toHaveLength(1)
    const crumbs = wrapper.findAll('nav[aria-label="Breadcrumb"] li').map(li => li.text())
    expect(crumbs).toEqual(['Product Handbook', 'Roadmap.pdf'])
    expect(document.title).toBe('Roadmap.pdf · Clear Ideas CE')
    expect(pdfViewerProps.last?.printEnabled).toBe(false)
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('shows the full folder trail for a file in a nested folder', async () => {
    const { wrapper } = await mountApp(`/site/${ID.handbook}/file/${ID.oldPlan}`)
    await waitFor(() =>
      expect(wrapper.findAll('nav[aria-label="Breadcrumb"] li').map(li => li.text())).toEqual([
        'Product Handbook',
        'Archive',
        '2024',
        'Old plan.pdf',
      ]),
    )
  })

  it('allows printing when the site enables it for the user’s role', async () => {
    backend.state.sites[0].attributes = {
      ...backend.state.sites[0].attributes,
      pdf: { printEnabled: true, printRoles: ['owner'] },
    }
    await mountApp(`/site/${ID.handbook}/file/${ID.roadmap}`)
    await waitFor(() => expect(pdfViewerProps.last?.printEnabled).toBe(true))
  })

  it('renders a text file inline', async () => {
    backend.fileBodies[ID.welcome] = '# Welcome\n\nThis is the handbook.'
    await mountApp(`/site/${ID.handbook}/file/${ID.welcome}`)
    await waitFor(() => expect(document.body.textContent).toContain('This is the handbook.'))
  })

  it('shows the file properties on the Properties tab', async () => {
    const { router } = await mountApp(`/site/${ID.handbook}/file/${ID.leave}/properties`)
    await waitFor(() => expect(document.body.textContent).toContain('Leave policy.pdf Properties'))
    const text = document.body.textContent ?? ''
    expect(text).toContain('application/pdf')
    expect(text).toContain('80 kB')
    expect(text).toContain('Policies')
    byText('[role="tab"]', 'File')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/file/${ID.leave}`))
  })

  it('offers download to an owner but not to a viewer', async () => {
    await mountApp(`/site/${ID.handbook}/file/${ID.roadmap}`)
    await waitFor(() => expect(document.body.querySelector('.pdf-viewer-stub')).not.toBeNull())
    expect(
      queryAll('button').some(b => /download/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')),
    ).toBe(true)
  })

  it('a viewer gets no download action', async () => {
    await mountApp(`/site/${ID.partner}/file/${ID.nda}`)
    await waitFor(() => expect(document.body.querySelector('.pdf-viewer-stub')).not.toBeNull())
    expect(
      queryAll('button').some(b => /download/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')),
    ).toBe(false)
  })

  it('an unknown (deleted, moved or unshared) file says so and leads back to its site', async () => {
    const { router } = await mountApp(`/site/${ID.handbook}/file/${'6'.repeat(24)}`)
    await waitFor(() => expect(document.body.textContent).toContain('This file is not available'))
    expect(document.title).toBe('File not available · Clear Ideas CE')
    byText<HTMLAnchorElement>('a', 'Back to Product Handbook')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}`))
  })

  it('a server error while opening a file is retryable', async () => {
    backend.failNext('GET', `/api/site/${ID.handbook}/file/${ID.roadmap}`, 500, { error: 'Storage offline' })
    await mountApp(`/site/${ID.handbook}/file/${ID.roadmap}`)
    await waitFor(() => expect(document.body.textContent).toContain('Storage offline'))
    byText<HTMLButtonElement>('button', 'Retry')!.click()
    await waitFor(() => expect(document.title).toBe('Roadmap.pdf · Clear Ideas CE'))
  })
})
