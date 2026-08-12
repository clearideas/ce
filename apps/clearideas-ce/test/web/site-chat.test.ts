import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  createSiteChatRequestBody,
  getRenderableSiteChatMessages,
  getSiteChatMessageText,
  sanitizeSiteChatMessages,
} from '../../src-web/src/utils/siteChat'

describe('CE site chat request body', () => {
  it('sends only server-accepted fields and omits AI SDK transport metadata', () => {
    const messages = [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What were the financial trends?' }],
      },
    ] as UIMessage[]

    const body = createSiteChatRequestBody({
      messages,
      selectedModel: 'openai:gpt-5.6-luna',
    })

    expect(body).toEqual({
      messages,
      model: 'openai:gpt-5.6-luna',
    })
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('trigger')
    expect(body).not.toHaveProperty('messageId')
  })

  it('omits model when no model is selected', () => {
    const messages = [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ] as UIMessage[]

    expect(createSiteChatRequestBody({ messages })).toEqual({ messages })
  })

  it('keeps persisted chat history text-only so partial tool calls cannot poison the next request', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What files are available?' }],
      },
      {
        id: 'assistant-tool-call',
        role: 'assistant',
        parts: [
          {
            type: 'tool-list_content',
            toolCallId: 'tool-call-1',
            state: 'input-streaming',
            input: {},
          },
        ],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'text', text: 'I found three files.' },
          {
            type: 'tool-search_content',
            toolCallId: 'tool-call-2',
            state: 'output-available',
            input: { query: 'GMV' },
            output: { results: [] },
          },
        ],
      },
    ]

    expect(sanitizeSiteChatMessages(messages)).toEqual([
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What files are available?' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'I found three files.' }],
      },
    ])
  })

  it('drops malformed persisted messages', () => {
    expect(sanitizeSiteChatMessages([
      null,
      { id: 'system-1', role: 'system', parts: [{ type: 'text', text: 'Nope' }] },
      { id: 'assistant-empty', role: 'assistant', parts: [{ type: 'text', text: '   ' }] },
      { id: 'assistant-valid', role: 'assistant', parts: [{ type: 'text', text: 'Safe history' }] },
    ])).toEqual([
      {
        id: 'assistant-valid',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Safe history' }],
      },
    ])
  })

  it('does not render stale tool-only assistant messages as permanent working bubbles', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Read the PDF' }],
      },
      {
        id: 'assistant-tool-only',
        role: 'assistant',
        parts: [
          {
            type: 'tool-retrieve_file_content',
            toolCallId: 'tool-call-1',
            state: 'output-available',
            input: { contentId: undefined },
            output: {
              error: 'A valid contentId is required.',
            },
          },
        ],
      },
    ] as any

    expect(getRenderableSiteChatMessages(messages, false).map(message => message.id)).toEqual([
      'user-1',
      'assistant-tool-only',
    ])
    expect(getRenderableSiteChatMessages(messages, true).map(message => message.id)).toEqual([
      'user-1',
      'assistant-tool-only',
    ])
    expect(getSiteChatMessageText(messages[1])).toBe('A valid contentId is required.')
  })
})
