import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, openSelect, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { T } from './fixtures'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Ask: questions across every site with AI chat on (or one chosen site), answered over the AI SDK
 * UI-message stream, with server-side conversations listed, renamed and deleted — through the real
 * app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const CONVERSATION = '670000000000000000000abc'

function seedConversation(overrides: { id?: string; title?: string; siteId?: string | null } = {}) {
  backend.chat.conversations.push({
    id: overrides.id ?? CONVERSATION,
    title: overrides.title ?? 'Quarterly numbers',
    siteId: overrides.siteId === undefined ? null : overrides.siteId,
    createdAt: T.older,
    updatedAt: T.newest,
    messages: [
      { id: 'u1', role: 'user', text: 'What were the quarterly numbers?', sources: [], createdAt: T.older },
      { id: 'a1', role: 'assistant', text: 'Revenue grew 12%.', sources: [], createdAt: T.older },
    ],
  })
}

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

const history = () => document.body.querySelector<HTMLElement>('nav[aria-label="Conversations"]')

describe('Ask', () => {
  it('is in the main navigation', async () => {
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(byText('[aria-label="Main"] a', 'Ask')).toBeDefined())
    byText('[aria-label="Main"] a', 'Ask')!.click()
    await waitFor(() => expect(router.currentRoute.value.name).toBe('ask'))
    await waitFor(() =>
      expect(
        document.body.querySelector('[aria-label="Main"] a[aria-current="page"]')?.textContent?.trim(),
      ).toBe('Ask'),
    )
  })

  it('answers across all sites, links the sources and routes to the new conversation', async () => {
    const { wrapper, router } = await mountApp('/ask')
    await waitFor(() => expect(document.body.textContent).toContain('Ask about your documents'))
    expect(history()?.textContent).toContain('Your conversations will be listed here.')

    await ask('What is on the roadmap?')
    await waitFor(() =>
      expect(document.body.textContent).toContain('Here is what I found about “What is on the roadmap?”'),
    )
    // A new conversation over every site: no conversation id, no site scope.
    const turn = backend.calls('POST', '/api/chat')[0].body
    expect(turn).toMatchObject({ message: { text: 'What is on the roadmap?' } })
    expect(turn).not.toHaveProperty('siteId')
    expect(turn).not.toHaveProperty('conversationId')

    // Sources link to the file and name its site (answers can span sites).
    const source = await waitFor(() => {
      const link = document.body.querySelector<HTMLAnchorElement>('[aria-label="Sources"] a')
      expect(link).not.toBeNull()
      return link!
    })
    expect(source.getAttribute('href')).toBe(`/site/${ID.handbook}/file/${ID.roadmap}`)
    expect(source.textContent).toContain('Roadmap.pdf')
    expect(source.textContent).toContain('Product Handbook')

    // The conversation gets its own URL and appears in the history.
    const id = backend.chat.conversations[0].id
    await waitFor(() => expect(router.currentRoute.value.params.conversationId).toBe(id))
    await waitFor(() => expect(history()?.textContent).toContain('What is on the roadmap?'))
    expect(history()?.textContent).toContain('Just now')
    expect(history()?.querySelector('a[aria-current="page"]')?.textContent).toContain(
      'What is on the roadmap?',
    )

    // A follow-up continues the same conversation.
    await ask('And after that?')
    await waitFor(() => expect(backend.calls('POST', '/api/chat')).toHaveLength(2))
    expect(backend.calls('POST', '/api/chat')[1].body).toMatchObject({ conversationId: id })
    expect(backend.calls('POST', '/api/chat')[1].body).not.toHaveProperty('siteId')
    await waitFor(() => expect(document.body.textContent).toContain('“And after that?”'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('limits a new conversation to one site when chosen', async () => {
    backend.state.sites[1].attributes = { ai: { chatEnabled: true } }
    await mountApp('/ask')
    const select = await waitFor(() => {
      const el = queryAll('.ask-view__scope-select')[0]
      expect(el?.textContent).toContain('All sites (2)')
      return el!
    })
    await openSelect(select)
    const option = await waitFor(() => {
      const el = byText('.v-overlay-container .v-list-item', 'Engineering Wiki')
      expect(el).toBeDefined()
      return el!
    })
    option.click()
    await settle()
    await ask('Where is the on-call guide?')
    await waitFor(() => expect(backend.calls('POST', '/api/chat')).toHaveLength(1))
    expect(backend.calls('POST', '/api/chat')[0].body).toMatchObject({ siteId: ID.wiki })
    await waitFor(() => expect(history()?.textContent).toContain('Engineering Wiki'))
  })

  it('opens a stored conversation from the history', async () => {
    seedConversation()
    seedConversation({ id: '670000000000000000000abd', title: 'Handbook question', siteId: ID.handbook })
    const { router, wrapper } = await mountApp('/ask')
    const link = await waitFor(() => {
      const el = byText<HTMLAnchorElement>('nav[aria-label="Conversations"] a', /Quarterly numbers/)
      expect(el).toBeDefined()
      return el!
    })
    // Site conversations (started in a site's AI tab) are listed with their site.
    expect(byText('nav[aria-label="Conversations"] a', /Handbook question/)?.textContent).toContain(
      'Product Handbook',
    )
    link.click()
    await waitFor(() => expect(router.currentRoute.value.params.conversationId).toBe(CONVERSATION))
    await waitFor(() => expect(document.body.textContent).toContain('Revenue grew 12%.'))
    expect(document.body.querySelector('.ask-view__title')?.textContent).toBe('Quarterly numbers')
    expect(document.body.querySelector('.ask-view__scope')?.textContent).toBe('All sites with AI chat')
    // The scope of a stored conversation is fixed.
    expect(document.body.querySelector('.ask-view__scope-select')).toBeNull()
    await expectNoBlockingA11yViolations(wrapper)

    byText<HTMLButtonElement>('nav[aria-label="Conversations"] button', 'New chat')!.click()
    await waitFor(() => expect(router.currentRoute.value.params.conversationId).toBeUndefined())
    await waitFor(() => expect(document.body.textContent).not.toContain('Revenue grew 12%.'))
  })

  it('renames and deletes a conversation', async () => {
    seedConversation()
    const { router } = await mountApp(`/ask/${CONVERSATION}`)
    await waitFor(() => expect(document.body.textContent).toContain('Revenue grew 12%.'))

    document.body.querySelector<HTMLButtonElement>('button[aria-label="Conversation actions"]')!.click()
    await waitFor(() => expect(byText('.v-overlay-container .v-list-item', 'Rename')).toBeDefined())
    byText('.v-overlay-container .v-list-item', 'Rename')!.click()
    const input = await waitFor(() => {
      const el = document.body.querySelector<HTMLInputElement>('#rename-conversation-form input')
      expect(el).not.toBeNull()
      return el!
    })
    expect(input.value).toBe('Quarterly numbers')
    input.value = 'Q3 results'
    input.dispatchEvent(new Event('input'))
    await settle()
    byText<HTMLButtonElement>('.v-overlay-container button', 'Rename')!.click()
    await waitFor(() =>
      expect(backend.calls('PATCH', `/api/chat/conversations/${CONVERSATION}`)[0]?.body).toEqual({
        title: 'Q3 results',
      }),
    )
    await waitFor(() =>
      expect(document.body.querySelector('.ask-view__title')?.textContent).toBe('Q3 results'),
    )

    document.body.querySelector<HTMLButtonElement>('button[aria-label="Conversation actions"]')!.click()
    await waitFor(() => expect(byText('.v-overlay-container .v-list-item', 'Delete')).toBeDefined())
    byText('.v-overlay-container .v-list-item', 'Delete')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Delete “Q3 results”?'))
    byText<HTMLButtonElement>('.v-overlay-container .v-card-actions button', 'Delete')!.click()
    await waitFor(() =>
      expect(backend.calls('DELETE', `/api/chat/conversations/${CONVERSATION}`)).toHaveLength(1),
    )
    await waitFor(() => expect(router.currentRoute.value.params.conversationId).toBeUndefined())
    expect(backend.chat.conversations).toHaveLength(0)
  })

  it('shows an error for a conversation that cannot be loaded', async () => {
    await mountApp(`/ask/${CONVERSATION}`)
    await waitFor(() => expect(document.body.textContent).toContain('Conversation not found.'))
  })

  it('lists conversations in a History menu on phones', async () => {
    seedConversation()
    const { router } = await mountApp('/ask', { width: 400 })
    await waitFor(() => expect(byText('button', 'History')).toBeDefined())
    expect(history()).toBeNull()
    // Already a new conversation: no "New chat" until one is open.
    expect(byText('button', 'New chat')).toBeUndefined()
    byText<HTMLButtonElement>('button', 'History')!.click()
    const item = await waitFor(() => {
      const el = byText('.v-overlay-container .v-list-item', /Quarterly numbers/)
      expect(el).toBeDefined()
      return el!
    })
    item.click()
    await waitFor(() => expect(router.currentRoute.value.params.conversationId).toBe(CONVERSATION))
    await waitFor(() => expect(byText('button', 'New chat')).toBeDefined())
  })

  it('explains when AI chat is not configured', async () => {
    backend.chat.configured = false
    const { wrapper } = await mountApp('/ask')
    await waitFor(() => expect(document.body.textContent).toContain('AI chat is not configured'))
    expect(document.body.textContent).toContain('AI_CHAT_MODEL')
    expect(document.body.querySelector('.chat-panel')).toBeNull()
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('explains when no site has AI chat turned on', async () => {
    backend.state.sites[0].attributes = { ai: { chatEnabled: false } }
    await mountApp('/ask')
    await waitFor(() =>
      expect(document.body.textContent).toContain('None of your sites has AI chat turned on'),
    )
    expect(document.body.querySelector('.chat-panel')).toBeNull()
  })

  it('shows a load error with retry', async () => {
    backend.failNext('GET', '/api/chat/conversations', 500, { error: 'Database unavailable' })
    await mountApp('/ask')
    await waitFor(() => expect(document.body.textContent).toContain('Database unavailable'))
    byText<HTMLButtonElement>('button', /Retry|Try again/)!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Ask about your documents'))
  })
})
