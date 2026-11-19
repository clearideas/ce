import { createCoreMcpToolDefinitions } from '@clearideas/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CeSiteToolAdapter } from '../../src/services/agent/site-tool-adapter'
import { ChatService } from '../../src/services/chat/chat-service'
import { CHAT_TOOL_NAMES, ChatToolAdapter } from '../../src/services/chat/chat-tools'

const FORBIDDEN_TOP_LEVEL_SCHEMA_KEYS = ['oneOf', 'anyOf', 'allOf', 'enum', 'not']
const ctx = { models: {}, providers: {} } as any
const access = { accountId: '6a0669a9e3532e8f7822bec1', userId: '6a0669a9e3532e8f7822bec2' }
const sites = [{ id: '6a0669a9e3532e8f7822bec0', name: 'Test Site' }]

/**
 * The AI tools' JSON schemas must be accepted by every provider (top-level object, no combinators),
 * and the chat's real provider path — runtime model profile → AI SDK provider → HTTP request — must
 * send them intact. The provider HTTP calls are stubbed.
 */
describe('AI tool schemas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses provider-compatible top-level JSON schemas for chat and agent tools', async () => {
    const chatTools = await new ChatToolAdapter(ctx, access, sites).listTools()
    expect(chatTools.map(tool => tool.name)).toEqual([...CHAT_TOOL_NAMES])
    const agentTools = await new CeSiteToolAdapter(ctx, { ...access, siteId: sites[0]!.id }).listTools()
    for (const tool of [...chatTools, ...agentTools])
      expectProviderCompatibleObjectSchema(tool.name, tool.inputSchema)
  })

  it('uses provider-compatible top-level JSON schemas for exported core MCP tool definitions', () => {
    for (const definition of createCoreMcpToolDefinitions({ includeAliases: true })) {
      expectProviderCompatibleObjectSchema(definition.name, definition.inputSchema)
      expect(definition.outputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('sends the chat tools through the OpenAI provider (AI_CHAT_MODEL=openai:…)', async () => {
    vi.stubEnv('AI_CHAT_MODEL', 'openai:gpt-4o-mini')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const requests: any[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response(
        [
          'data: {"type":"response.created","response":{"id":"resp_test","object":"response","created_at":0,"model":"gpt-4o-mini","status":"in_progress","output":[],"usage":null}}',
          '',
          'data: {"type":"response.completed","response":{"id":"resp_test","object":"response","created_at":0,"model":"gpt-4o-mini","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}',
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      )
    })
    await runTurn()
    expect(requests).toHaveLength(1)
    expect(requests[0].tools.map((tool: any) => tool.name)).toEqual([...CHAT_TOOL_NAMES])
    for (const definition of requests[0].tools) {
      expect(definition.type).toBe('function')
      expectProviderCompatibleObjectSchema(definition.name, definition.parameters)
    }
  })

  // Also the regression test for the `@ai-sdk/anthropic@4` pin (root package.json overrides): from
  // 4.0.72 the streamed `message_start` becomes a `custom` content part that agent-runtime-model-ai-sdk
  // ≤ 0.6.0 rejects ("unsupported replay content: custom"), and this test fails.
  it('sends the chat tools through the Anthropic provider (AI_CHAT_MODEL=anthropic:…)', async () => {
    vi.stubEnv('AI_CHAT_MODEL', 'anthropic:claude-sonnet-4-5')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const requests: any[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response(
        [
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
        ].join('\n'),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      )
    })
    const result = await runTurn()
    expect(result.text).toBe('ok')
    expect(requests[0].tools.map((tool: any) => tool.name)).toEqual([...CHAT_TOOL_NAMES])
    for (const definition of requests[0].tools)
      expectProviderCompatibleObjectSchema(definition.name, definition.input_schema)
  })
})

function runTurn() {
  return new ChatService(ctx).runTurn({
    access,
    sites,
    history: [],
    question: 'What files are available?',
    onText: () => {},
    onActivity: () => {},
  })
}

function expectProviderCompatibleObjectSchema(name: string, schema: any) {
  expect(schema, `${name} schema must exist`).toBeTruthy()
  expect(schema.type, `${name} schema must have top-level type object`).toBe('object')
  expect(schema.additionalProperties, `${name} schema must reject unknown properties`).toBe(false)
  for (const key of FORBIDDEN_TOP_LEVEL_SCHEMA_KEYS) {
    expect(schema, `${name} schema must not use top-level ${key}`).not.toHaveProperty(key)
  }
}
