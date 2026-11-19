import { afterEach, describe, expect, it } from 'vitest'
import { envValue } from '../../src/lib/env.js'

const names = ['CE_TEST_PRIMARY', 'CE_TEST_FALLBACK']
afterEach(() => {
  for (const name of names) delete process.env[name]
})

describe('envValue', () => {
  it('returns the first non-blank value, trimmed', () => {
    process.env.CE_TEST_PRIMARY = '  openai:gpt-5.6-luna '
    process.env.CE_TEST_FALLBACK = 'anthropic:claude'
    expect(envValue(...names)).toBe('openai:gpt-5.6-luna')
  })

  it('treats a blank variable as unset, so the fallback applies (.env.example / docker-compose `${X:-}`)', () => {
    process.env.CE_TEST_PRIMARY = ''
    process.env.CE_TEST_FALLBACK = 'anthropic:claude'
    expect(envValue(...names)).toBe('anthropic:claude')
    process.env.CE_TEST_PRIMARY = '   '
    expect(envValue(...names)).toBe('anthropic:claude')
  })

  it('is undefined when nothing is set', () => {
    process.env.CE_TEST_PRIMARY = ''
    expect(envValue(...names)).toBeUndefined()
  })
})

describe('agent runtime configuration', () => {
  afterEach(() => {
    delete process.env.AI_AGENT_MODEL
    delete process.env.AI_CHAT_MODEL
  })

  it('falls back to AI_CHAT_MODEL when AI_AGENT_MODEL is blank (as .env.example ships it)', async () => {
    const { AgentHostService } = await import('../../src/services/agent/agent-host.js')
    const host = new AgentHostService({} as never)
    process.env.AI_AGENT_MODEL = ''
    process.env.AI_CHAT_MODEL = ''
    expect(host.isConfigured()).toBe(false)
    process.env.AI_CHAT_MODEL = 'openai:gpt-5.6-luna'
    expect(host.isConfigured()).toBe(true)
    process.env.AI_AGENT_MODEL = 'anthropic:claude-sonnet-5'
    expect(host.isConfigured()).toBe(true)
  })
})
