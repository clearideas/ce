import { describe, expect, it, vi } from 'vitest'
import {
  generateAccessKeyPair,
  getActiveScopesByType,
  getInvalidScopesByType,
  hashAccessKeyValue,
  createActivityLogger,
  postActivityBase,
  createLogEmailProvider,
  createTemplateEmailProvider,
  llmContentReferenceArgsSchema,
  llmListContentArgsSchema,
  llmRetrieveFileContentArgsSchema,
  llmSearchContentArgsSchema,
  getCoreMcpToolRequiredScope,
  normalizeCoreMcpToolName,
  renderEmailTemplate,
  validateSchema,
  buildLoginUrl,
} from '@clearideas/core'

describe('core reusable services', () => {
  it('generates, hashes, and validates access key scopes', () => {
    const pair = generateAccessKeyPair({ keyType: 'mcp' })

    expect(pair.key).toMatch(/^mcp_[a-f0-9]{16}\.[a-f0-9]{64}$/)
    expect(pair.prefix).toMatch(/^mcp_[a-f0-9]{8}\.\.\.$/)
    expect(hashAccessKeyValue(pair.key)).toHaveLength(64)
    expect(getInvalidScopesByType({ keyType: 'mcp', scopes: ['mcp:read', 'admin'] })).toEqual(['admin'])
    expect(getActiveScopesByType().mcp).toEqual(['mcp:read', 'mcp:write'])
  })

  it('accepts documented namespaced MCP tools and canonicalizes their scopes', () => {
    expect(normalizeCoreMcpToolName('clearideas.list_sites')).toBe('list_sites')
    expect(normalizeCoreMcpToolName('clearideas.create_folder')).toBe('create_folder')
    expect(getCoreMcpToolRequiredScope('clearideas.list_sites')).toBe('mcp:read')
    expect(getCoreMcpToolRequiredScope('clearideas.create_folder')).toBe('mcp:write')
  })

  it('builds invite login links that can carry one-time codes', () => {
    expect(buildLoginUrl({
      baseUrl: 'https://localhost:4110/',
      email: 'member+test@clearideas.local',
      siteId: 'site-1',
      code: '123456',
    })).toBe('https://localhost:4110/login?email=member%2Btest%40clearideas.local&siteId=site-1&code=123456')
  })

  it('renders templates, preserves override subjects, and logs safely', async () => {
    const sent: any[] = []
    const provider = createTemplateEmailProvider({
      templateLoader: {
        async load(alias) {
          expect(alias).toBe('welcome')
          return {
            subject: 'Hello {{name}}',
            html: '<strong>{{name}}</strong>',
            text: 'Hi {{name}}',
          }
        },
      },
      transport: {
        async send(input) {
          sent.push(input)
        },
      },
    })

    expect(renderEmailTemplate({ subject: 'Code {{code}}' }, { code: '123456' })).toEqual({
      subject: 'Code 123456',
      html: undefined,
      text: undefined,
    })

    await provider.sendTemplate({
      to: 'user@example.test',
      templateAlias: 'welcome',
      subject: 'Override',
      templateModel: { name: 'Blair' },
    })

    expect(sent[0]).toMatchObject({
      to: 'user@example.test',
      subject: 'Override',
      html: '<strong>Blair</strong>',
      text: 'Hi Blair',
    })

    const logger = { info: vi.fn() }
    await createLogEmailProvider({ logger }).send({ to: 'log@example.test', subject: 'Logged' })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[clearideas-email]'))
  })

  it('normalizes activity attributes and supports safe logging', async () => {
    const writes: any[] = []
    const result = await postActivityBase({
      activity: {
        user: 'user-1',
        action: 'viewed',
        target: 'file-1',
        onModel: 'Content',
        attributes: ['not-valid'] as any,
      },
      writeActivity: activity => writes.push(activity),
    })

    expect(result).toEqual({ message: 'Activity successfully created' })
    expect(writes[0]).toMatchObject({ action: 'viewed', attributes: {} })

    const logger = createActivityLogger(async () => {
      throw new Error('logging backend unavailable')
    })
    await expect(logger.safe({
      action: 'downloaded',
      target: 'file-1',
      onModel: 'Content',
    })).resolves.toBeUndefined()
  })

  it('validates LLM tool arguments before domain access', async () => {
    const contentId = '6a0669a96aa08c7a23e9bd29'

    await expect(validateSchema(llmContentReferenceArgsSchema, {}))
      .rejects.toThrow('contentId is required')
    await expect(validateSchema(llmContentReferenceArgsSchema, { contentId: undefined }))
      .rejects.toThrow('contentId is required')
    await expect(validateSchema(llmContentReferenceArgsSchema, { contentId: 'undefined' }))
      .rejects.toThrow('contentId is required')

    await expect(validateSchema(llmContentReferenceArgsSchema, { id: contentId }))
      .resolves.toMatchObject({ contentId: expect.anything() })

    const retrieveArgs = await validateSchema(llmRetrieveFileContentArgsSchema, {
      fileId: contentId,
      maxTokens: '1200',
    })
    expect(String(retrieveArgs.contentId)).toBe(contentId)
    expect(retrieveArgs.maxTokens).toBe(1200)

    const listArgs = await validateSchema(llmListContentArgsSchema, {
      folderId: contentId,
      limit: '25',
    })
    expect(String(listArgs.folderId)).toBe(contentId)
    expect(listArgs.limit).toBe(25)

    await expect(validateSchema(llmSearchContentArgsSchema, { query: ' GMV ' }))
      .resolves.toEqual({ query: 'GMV' })
    await expect(validateSchema(llmSearchContentArgsSchema, { query: '' }))
      .rejects.toThrow('query is required')
  })
})
