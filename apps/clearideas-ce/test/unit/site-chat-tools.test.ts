import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createCoreMcpToolDefinitions } from '@clearideas/core'
import { describe, expect, it } from 'vitest'
import { streamText } from 'ai'
import { SiteChatController } from '../../src/controllers/chat/site-chat.controller'

const FORBIDDEN_TOP_LEVEL_SCHEMA_KEYS = ['oneOf', 'anyOf', 'allOf', 'enum', 'not']

describe('site chat tool schemas', () => {
  it('uses provider-compatible top-level JSON schemas for every site chat tool', () => {
    const controller = new SiteChatController({
      models: {},
      providers: {},
    } as any)
    const site = {
      _id: '6a0669a9e3532e8f7822bec0',
      name: 'Test Site',
      files: [],
      folders: [],
      attributes: { ai: { chatEnabled: true } },
    }
    const tools = (controller as any).buildSiteChatTools(site, String(site._id))

    for (const [name, definition] of Object.entries<any>(tools)) {
      expectProviderCompatibleObjectSchema(name, definition.inputSchema.jsonSchema)
    }
  })

  it('uses provider-compatible top-level JSON schemas for exported core MCP tool definitions', () => {
    for (const definition of createCoreMcpToolDefinitions({ includeAliases: true })) {
      expectProviderCompatibleObjectSchema(definition.name, definition.inputSchema)
      expect(definition.outputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('passes site chat tools through the actual OpenAI provider request builder', async () => {
    const tools = buildSiteChatTools()
    const openai = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.tools).toHaveLength(Object.keys(tools).length)
        for (const definition of body.tools) {
          expect(definition.type).toBe('function')
          expectProviderCompatibleObjectSchema(definition.name, definition.parameters)
        }
        return new Response([
          'data: {"type":"response.created","response":{"id":"resp_test","object":"response","created_at":0,"model":"gpt-4o-mini","status":"in_progress","output":[],"usage":null}}',
          '',
          'data: {"type":"response.completed","response":{"id":"resp_test","object":"response","created_at":0,"model":"gpt-4o-mini","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}',
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: [{ role: 'user', content: 'What files are available?' }],
      tools,
    })

    await result.consumeStream()
  })

  it('passes site chat tools through the actual Anthropic provider request builder', async () => {
    const tools = buildSiteChatTools()
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.tools).toHaveLength(Object.keys(tools).length)
        for (const definition of body.tools) {
          expectProviderCompatibleObjectSchema(definition.name, definition.input_schema)
        }
        return new Response([
          'event: message_start',
          'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}',
          '',
          'event: content_block_start',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
          '',
          'event: content_block_stop',
          'data: {"type":"content_block_stop","index":0}',
          '',
          'event: message_delta',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":1}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
          '',
        ].join('\n'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })

    const result = streamText({
      model: anthropic('claude-sonnet-4-5'),
      messages: [{ role: 'user', content: 'What files are available?' }],
      tools,
    })

    await result.consumeStream()
  })
})

function buildSiteChatTools() {
  const controller = new SiteChatController({
    models: {},
    providers: {},
  } as any)
  const site = {
    _id: '6a0669a9e3532e8f7822bec0',
    name: 'Test Site',
    files: [],
    folders: [],
    attributes: { ai: { chatEnabled: true } },
  }
  return (controller as any).buildSiteChatTools(site, String(site._id))
}

function expectProviderCompatibleObjectSchema(name: string, schema: any) {
  expect(schema, `${name} schema must exist`).toBeTruthy()
  expect(schema.type, `${name} schema must have top-level type object`).toBe('object')
  expect(schema.additionalProperties, `${name} schema must reject unknown properties`).toBe(false)
  for (const key of FORBIDDEN_TOP_LEVEL_SCHEMA_KEYS) {
    expect(schema, `${name} schema must not use top-level ${key}`).not.toHaveProperty(key)
  }
}
