import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

/**
 * Public-API test for @clearideas/pdf-viewer: props, labels, events, exposed methods and toolbar
 * accessibility. pdf.js is mocked with a two-page document; rendering internals are out of scope.
 */
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => {
  const page = (pageNumber: number) => ({
    pageNumber,
    getViewport: ({ scale = 1 }: { scale?: number; rotation?: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    getTextContent: async () => ({
      items: [{ str: `Hello page ${pageNumber}`, transform: [1, 0, 0, 1, 10, 700], width: 100, height: 12 }],
    }),
    streamTextContent: () => ({}),
    render: () => ({ promise: Promise.resolve(), cancel() {} }),
    cleanup() {},
  })
  const pdf = { numPages: 2, getPage: async (n: number) => page(n) }
  const loadingTask = { promise: Promise.resolve(pdf), destroy: async () => {} }
  class TextLayer {
    async render() {}
    cancel() {}
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    TextLayer,
    getDocument: vi.fn(() => loadingTask),
    version: 'test',
  }
})

// jsdom has no canvas; the viewer only needs a 2d context that accepts drawing calls.
HTMLCanvasElement.prototype.getContext = (() =>
  ({
    drawImage() {},
    clearRect() {},
    fillRect() {},
    save() {},
    restore() {},
  }) as unknown as CanvasRenderingContext2D) as never
HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'

async function mountViewer(props: Record<string, unknown> = {}) {
  const { BasePDFViewer } = await import('@clearideas/pdf-viewer')
  const wrapper = await mountWithVuetify(BasePDFViewer, {
    props: { pdfData: new Uint8Array([0x25, 0x50, 0x44, 0x46]), ...props },
  })
  await settle()
  await settle()
  return wrapper
}

describe('@clearideas/pdf-viewer public API', () => {
  it('opens a document, reports the page count and renders the toolbar with accessible names', async () => {
    const wrapper = await mountViewer()
    expect(wrapper.emitted('document-open')?.[0]).toEqual([{ pageCount: 2 }])
    expect(wrapper.findAll('.ci-pdf-viewer__page').length).toBeGreaterThan(0)
    // Toolbar buttons carry the default English labels as accessible names.
    for (const name of [
      'Pages',
      'Search',
      'Previous page',
      'Next page',
      'Zoom out',
      'Zoom in',
      'View options',
    ]) {
      expect(wrapper.find(`button[aria-label="${name}"]`).exists(), name).toBe(true)
    }
    expect(wrapper.find('button[aria-label="Print"]').exists()).toBe(false) // printEnabled defaults to false
    await expectNoA11yViolations(wrapper)
  })

  it('applies label overrides and renders the rotate/print controls when enabled', async () => {
    const wrapper = await mountViewer({
      rotateEnabled: true,
      printEnabled: true,
      labels: { zoomIn: 'Vergrößern', print: 'Drucken' },
    })
    expect(wrapper.find('button[aria-label="Vergrößern"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Drucken"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Rotate page"]').exists()).toBe(true)
  })

  it('navigates pages through the exposed API and emits page-change', async () => {
    const wrapper = await mountViewer()
    const api = wrapper.vm as unknown as { goToPage: (n: number) => void }
    api.goToPage(2)
    await nextTick()
    await settle()
    const changes = wrapper.emitted('page-change') ?? []
    expect(changes.at(-1)).toEqual([2])
  })

  it('emits zoom-change with the full view state', async () => {
    const wrapper = await mountViewer()
    await wrapper.find('button[aria-label="Zoom in"]').trigger('click')
    await settle()
    const payload = wrapper.emitted('zoom-change')?.at(-1)?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({ viewMode: 'single', scrollMode: 'paged', fitMode: 'manual' })
    expect(typeof payload.scale).toBe('number')
  })

  it('shows the failed-load label when pdf.js rejects', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    vi.mocked(pdfjs.getDocument).mockImplementationOnce(
      () => ({ promise: Promise.reject(new Error('corrupt')), destroy: async () => {} }) as never,
    )
    const wrapper = await mountViewer({ labels: { failedLoad: 'Could not open' } })
    expect(wrapper.text()).toContain('Could not open')
  })
})
