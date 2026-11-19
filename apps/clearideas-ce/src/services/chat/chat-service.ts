import {
  AgentRuntime,
  MemoryRunStore,
  parseAgentManifest,
  PromptStepExecutor,
  type ModelAdapter,
  type PromptMessage,
} from '@clearideas/agent-runtime'
import { castSiteQueryIds, getPermittedSiteIdsBase } from '@clearideas/core'
import { ForbiddenError } from '@clearideas/core/errors'
import { randomUUID } from 'node:crypto'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { CE_SECURITY_PREAMBLE } from '../../lib/instruction-leak-guard.js'
import { assertSiteReadAccess } from '../../middleware/access-control.js'
import { createHostModelAdapter } from '../agent/host-model.js'
import type { ContentToolAccess } from '../content-tools.js'
import { configuredChatModels, resolveChatModel } from './chat-models.js'
import { CHAT_TOOL_NAMES, ChatToolAdapter, type ChatScopeSite, type ChatSource } from './chat-tools.js'

/** Earlier messages sent with each turn, and the longest text kept from each. */
const HISTORY_MESSAGES = 20
const HISTORY_MESSAGE_CHARS = 8000

export interface ChatTurnInput {
  access: ContentToolAccess
  sites: ChatScopeSite[]
  /** Earlier messages of the conversation, oldest first. */
  history: Array<{ role: 'user' | 'assistant'; text: string }>
  question: string
  model?: string
  signal?: AbortSignal
  onText: (delta: string) => void
  onActivity: (label: string) => void
}

export interface ChatTurnResult {
  text: string
  sources: ChatSource[]
  model: string
}

/**
 * Chat on the agent runtime: each turn is one prompt step (conversation history + question) with the
 * chat content tools, bounded by the manifest limits (tool calls, input size, provider timeout). A
 * runtime token budget is not used: it requires every provider to report usage, and OpenAI-compatible
 * local models may not. Text streams through the runtime's `model.text.delta` events.
 */
export class ChatService {
  constructor(
    private readonly ctx: CeAppContext,
    private readonly modelAdapter?: ModelAdapter,
  ) {}

  isConfigured() {
    return Boolean(this.modelAdapter || configuredChatModels().defaultModel)
  }

  /**
   * The sites a conversation may use. One site (Site AI): the user must be able to read it — the same
   * rule as opening it — and AI chat must be on. All sites (Ask): every site the user owns or is a
   * current member of with AI chat on, except sites the user has blocked.
   */
  async scopeSites(
    access: ContentToolAccess & { suppressedSiteIds?: string[] },
    siteId?: string,
  ): Promise<ChatScopeSite[]> {
    if (siteId) {
      const site = await assertSiteReadAccess({ models: this.ctx.models, ...access, siteId })
      if (site.attributes?.ai?.chatEnabled !== true)
        throw new ForbiddenError('AI chat is not enabled for this site')
      return [{ id: String(site._id), name: String(site.name ?? '') }]
    }
    const ids = await getPermittedSiteIdsBase(
      {
        findSiteIds: async query => {
          const rows = await this.ctx.models.SiteModel.find({
            ...castSiteQueryIds(query),
            'attributes.ai.chatEnabled': true,
          })
            .select('_id')
            .lean()
          return rows.map((row: any) => String(row._id))
        },
      },
      {
        accountId: access.accountId,
        userId: access.userId,
        roles: config.site.roles.readRoles,
        ownerRoles: config.site.roles.ownerRoles,
        accepted: true,
        suppressedSiteIds: access.suppressedSiteIds,
      },
    )
    if (ids.length === 0) return []
    const sites = await this.ctx.models.SiteModel.find({ _id: { $in: ids } })
      .select('_id name')
      .sort({ name: 1 })
      .lean()
    return sites.map((site: any) => ({ id: String(site._id), name: String(site.name ?? '') }))
  }

  async runTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
    const tools = new ChatToolAdapter(this.ctx, input.access, input.sites, input.onActivity)
    const history = input.history.slice(-HISTORY_MESSAGES).map((message): PromptMessage => ({
      role: message.role,
      content: [{ type: 'text', text: message.text.slice(0, HISTORY_MESSAGE_CHARS) || '(no answer)' }],
    }))
    const manifest = parseAgentManifest({
      schemaVersion: '1.0',
      name: 'Clear Ideas chat',
      model: { ref: 'default' },
      limits: {
        maxSteps: 1,
        maxMessagesPerPrompt: 100,
        maxInputBytes: 600_000,
        maxOutputBytes: 200_000,
        maxToolCallsPerIteration: 6,
        providerTimeoutMs: 120_000,
      },
      steps: [
        {
          id: 'answer',
          type: 'prompt',
          tools: [...CHAT_TOOL_NAMES],
          completionPolicy: { onTruncation: 'accept' },
          messages: [
            { role: 'system', content: [{ type: 'text', text: systemPrompt(input.sites) }] },
            ...history,
            { role: 'user', content: [{ type: 'text', text: input.question }] },
          ],
        },
      ],
    })
    const modelName = this.modelAdapter ? 'test' : resolveChatModel(input.model)
    const model = this.modelAdapter ?? createHostModelAdapter(modelName, manifest, 'AI_CHAT_MODEL')

    let streamed = ''
    const runtime = new AgentRuntime({
      runStore: new MemoryRunStore(),
      stepExecutors: [new PromptStepExecutor({ defaultMaxToolCalls: 12 })],
      model,
      tools,
      eventSinks: [
        {
          emit: event => {
            if (event.type !== 'model.text.delta') return
            const delta = typeof event.data?.delta === 'string' ? event.data.delta : ''
            if (!delta) return
            streamed += delta
            input.onText(delta)
          },
        },
      ],
    })
    const result = await runtime.run({
      manifest,
      runId: `chat_${randomUUID()}`,
      signal: input.signal,
    })
    const output = typeof result.output === 'string' ? result.output : ''
    // A model without streaming only reports the final text.
    const text = output || streamed
    if (!streamed && text) input.onText(text)
    return { text, sources: tools.sourcesFor(text), model: modelName }
  }
}

function systemPrompt(sites: ChatScopeSite[]) {
  const scope =
    sites.length === 1
      ? `This conversation is about one site: "${sites[0]!.name}" (siteId ${sites[0]!.id}).`
      : sites.length <= 20
        ? `This conversation can use these sites: ${sites.map(site => `"${site.name}" (siteId ${site.id})`).join(', ')}.`
        : `This conversation can use ${sites.length} sites; call list_sites to see them.`
  return [CE_SECURITY_PREAMBLE, config.ai.chatSystemPrompt, scope].join('\n\n')
}
