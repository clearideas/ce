import { describe, expect, it } from 'vitest'
import { manifestUsesSiteTools, validateCeAgentManifest } from '../../src/services/agent/manifest-policy.js'

describe('CE agent manifest policy', () => {
  it('normalizes a prompt manifest to the host model and CE limits', () => {
    const manifest = validateCeAgentManifest({
      schemaVersion: '1.0',
      name: 'Summarizer',
      variables: [{ key: 'topic', type: 'string', requiresOverride: true }],
      steps: [{ id: 'summary', type: 'prompt', prompt: '{{ topic }}' }],
    })
    expect(manifest.model).toEqual({ ref: 'default' })
    expect(manifest.limits).toMatchObject({ maxSteps: 20, maxToolCallsPerIteration: 10 })
    expect(manifestUsesSiteTools(manifest)).toBe(false)
  })

  it('allows only the read-only Site tool set', () => {
    const manifest = validateCeAgentManifest({
      schemaVersion: '1.0',
      name: 'Researcher',
      model: { ref: 'default' },
      steps: [{ id: 'search', type: 'prompt', prompt: 'Find it', tools: ['search_content'] }],
    })
    expect(manifestUsesSiteTools(manifest)).toBe(true)
    expect(() =>
      validateCeAgentManifest({
        schemaVersion: '1.0',
        name: 'Writer',
        steps: [{ id: 'write', type: 'prompt', prompt: 'Change it', tools: ['delete_content'] }],
      }),
    ).toThrow(/not supported/i)
  })

  it('rejects unsupported steps, connections, and model selection', () => {
    expect(() =>
      validateCeAgentManifest({
        schemaVersion: '1.0',
        name: 'Webhook',
        steps: [{ id: 'call', type: 'webhook', url: 'https://example.com' }],
      }),
    ).toThrow(/step type/i)
    expect(() =>
      validateCeAgentManifest({
        schemaVersion: '1.0',
        name: 'Connected',
        connections: [{ ref: 'remote' }],
        steps: [{ id: 'ask', type: 'prompt', prompt: 'Ask' }],
      }),
    ).toThrow(/connections/i)
    expect(() =>
      validateCeAgentManifest({
        schemaVersion: '1.0',
        name: 'Selected model',
        model: { provider: 'openai', model: 'something' },
        steps: [{ id: 'ask', type: 'prompt', prompt: 'Ask' }],
      }),
    ).toThrow(/default model/i)
  })
})
