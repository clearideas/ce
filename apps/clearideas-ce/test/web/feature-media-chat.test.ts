import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { byText, mountApp, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { file, T } from './fixtures'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — file embeds (image/audio/video/code/unsupported + download), site branding
 * uploads (MediaDropZone) and the site AI chat (SiteChat over the AI SDK UI-message stream),
 * through the real app against the fake backend.
 */
vi.mock('@clearideas/pdf-viewer', () => ({
  BasePDFViewer: defineComponent({ name: 'BasePDFViewerStub', setup: () => () => h('div', 'PDF') }),
}))

let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
  // jsdom has no object URLs.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:fake-object-url'),
    revokeObjectURL: vi.fn(),
  })
})

function addRootFile(id: string, name: string, contentType: string) {
  backend.state.sites[0].files = [
    ...(backend.state.sites[0].files ?? []),
    file(id, name, { contentType, size: 321 }),
  ]
}

describe('File embeds', () => {
  it('renders an image file from an object URL', async () => {
    const id = 'd'.repeat(24)
    addRootFile(id, 'diagram.png', 'image/png')
    await mountApp(`/site/${ID.handbook}/file/${id}`)
    // VImg only swaps in its <img> once visible (no layout in jsdom); the embed and URL are what matter.
    await waitFor(() => expect(document.body.querySelector('.image-embed__image')).not.toBeNull())
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it.each([
    ['audio', 'briefing.mp3', 'audio/mpeg', 'audio'],
    ['video', 'walkthrough.mp4', 'video/mp4', 'video'],
  ])('renders an %s file inline from an object URL', async (_kind, name, contentType, tag) => {
    const id = 'a'.repeat(24)
    addRootFile(id, name, contentType)
    await mountApp(`/site/${ID.handbook}/file/${id}`)
    await waitFor(() => {
      const media = document.body.querySelector<HTMLMediaElement | HTMLImageElement>(`.file-viewer ${tag}`)
      expect(media?.getAttribute('src') ?? media?.querySelector('source')?.getAttribute('src')).toBe(
        'blob:fake-object-url',
      )
    })
  })

  it('highlights a code/JSON file', async () => {
    const id = 'b'.repeat(24)
    addRootFile(id, 'config.json', 'application/json')
    backend.fileBodies[id] = '{ "retention": 30 }'
    await mountApp(`/site/${ID.handbook}/file/${id}`)
    await waitFor(() => expect(document.body.querySelector('pre code')?.textContent).toContain('"retention"'))
  })

  it('offers a download for a type that cannot be previewed, using a download token', async () => {
    const id = 'c'.repeat(24)
    addRootFile(id, 'archive.zip', 'application/zip')
    const clicks: string[] = []
    const original = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.getAttribute('href') ?? '')
    }
    try {
      const { wrapper } = await mountApp(`/site/${ID.handbook}/file/${id}`)
      await waitFor(() => expect(document.body.textContent).toContain('cannot be previewed'))
      const download = queryAll('.file-viewer button').find(b =>
        /download/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`),
      )!
      download.click()
      await waitFor(() => expect(clicks).toHaveLength(1))
      expect(clicks[0]).toBe(`/api/files/download/${id}?token=file-token`)
      expect(backend.calls('GET', `/api/site/${ID.handbook}/file/${id}/token`)[0].query.get('purpose')).toBe(
        'download',
      )
      await expectNoBlockingA11yViolations(wrapper)
    } finally {
      HTMLAnchorElement.prototype.click = original
    }
  })
})

describe('Site branding uploads', () => {
  it('uploads a site icon image and removes it again', async () => {
    const { wrapper } = await mountApp(`/site/${ID.handbook}/settings/branding`)
    const zone = await waitFor(() => {
      const el = queryAll('.drop-zone').find(z => z.textContent?.includes('Upload or drop icon here'))
      expect(el).toBeDefined()
      return el!
    })
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' })
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: { files: [svg], items: [{ kind: 'file', type: 'image/svg+xml' }], types: ['Files'] },
      })
      zone.dispatchEvent(event)
    }
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    const body = backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body as {
      attributes: { media: { icon: { dataUrl: string } } }
    }
    expect(body.attributes.media.icon.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/)

    const remove = await waitFor(() => {
      const el = document.body.querySelector<HTMLButtonElement>('button[aria-label="Remove icon"]')
      expect(el).not.toBeNull()
      return el!
    })
    await expectNoBlockingA11yViolations(wrapper)
    remove.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(2))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[1].body).toEqual({
      attributes: { media: { icon: null } },
    })
  })

  it('rejects a file that is not an image', async () => {
    await mountApp(`/site/${ID.handbook}/settings/branding`)
    const zone = await waitFor(() => {
      const el = queryAll('.drop-zone').find(z => z.textContent?.includes('Upload or drop icon here'))
      expect(el).toBeDefined()
      return el!
    })
    const pdf = new File(['%PDF'], 'contract.pdf', { type: 'application/pdf' })
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: { files: [pdf], items: [{ kind: 'file', type: 'application/pdf' }], types: ['Files'] },
      })
      zone.dispatchEvent(event)
    }
    await settle()
    await settle()
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(0)
  })
})

describe('Site AI chat', () => {
  async function ask(question: string) {
    const box = await waitFor(() => {
      const el = document.body.querySelector<HTMLTextAreaElement>('.chat-panel__composer textarea')
      expect(el).not.toBeNull()
      return el!
    })
    box.value = question
    box.dispatchEvent(new Event('input'))
    await settle()
    byText<HTMLButtonElement>('.chat-panel__composer button', 'Send')!.click()
  }

  it('asks about the site and renders the streamed answer with its sources, saved to the account', async () => {
    const { wrapper } = await mountApp(`/site/${ID.handbook}/ai`)
    await ask('How do I request leave?')
    await waitFor(() =>
      expect(document.body.textContent).toContain('Here is what I found about “How do I request leave?”'),
    )
    // The turn is scoped to this site and sends only the new question (the server keeps the history).
    expect(backend.calls('POST', '/api/chat')[0].body).toMatchObject({
      siteId: ID.handbook,
      message: { text: 'How do I request leave?' },
    })
    const source = await waitFor(() => {
      const link = document.body.querySelector<HTMLAnchorElement>('[aria-label="Sources"] a')
      expect(link).not.toBeNull()
      return link!
    })
    expect(source.textContent).toContain('Roadmap.pdf')
    expect(source.getAttribute('href')).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`)
    expect(backend.chat.conversations[0]).toMatchObject({
      siteId: ID.handbook,
      title: 'How do I request leave?',
    })
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('reopens the latest conversation of the site, and New chat starts another', async () => {
    backend.chat.conversations.push({
      id: '670000000000000000000abc',
      title: 'Earlier question',
      siteId: ID.handbook,
      createdAt: T.older,
      updatedAt: T.newest,
      messages: [
        { id: 'u1', role: 'user', text: 'Earlier question', sources: [], createdAt: T.older },
        { id: 'a1', role: 'assistant', text: 'Earlier answer', sources: [], createdAt: T.older },
      ],
    })
    await mountApp(`/site/${ID.handbook}/ai`)
    await waitFor(() => expect(document.body.textContent).toContain('Earlier answer'))
    byText<HTMLButtonElement>('button', 'New chat')!.click()
    await waitFor(() => expect(document.body.textContent).not.toContain('Earlier answer'))
    await ask('Something new')
    await waitFor(() => expect(backend.calls('POST', '/api/chat')).toHaveLength(1))
    expect(backend.calls('POST', '/api/chat')[0].body).not.toHaveProperty('conversationId')
  })

  it('shows the error when the chat request fails', async () => {
    backend.failNext('POST', '/api/chat', 403, { error: 'AI chat is not enabled for this site' })
    await mountApp(`/site/${ID.handbook}/ai`)
    await ask('Hello?')
    await waitFor(() => expect(document.body.textContent).toContain('AI chat is not enabled for this site'))
  })
})
