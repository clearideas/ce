import {
  createConfiguredModelAdapter,
  parseAgentRuntimeConfig,
  type AgentManifest,
  type ModelAdapter,
} from '@clearideas/agent-runtime'
import { BadRequestError } from '@clearideas/core/errors'

/**
 * The model adapter for a host-configured `provider:model` string (AI_AGENT_MODEL for agents,
 * AI_CHAT_MODEL for chat), bound as the manifest's `default` model profile. Provider keys come from
 * the provider's conventional environment variable (OPENAI_API_KEY, ANTHROPIC_API_KEY, …).
 */
export function createHostModelAdapter(
  configured: string,
  manifest: AgentManifest,
  variable: string,
): ModelAdapter {
  const [provider, ...parts] = configured.split(':')
  const model = parts.join(':')
  if (!provider || !model) {
    throw new BadRequestError(`${variable} must use provider:model, for example openai:gpt-5.6-luna.`)
  }
  try {
    const runtimeConfig = parseAgentRuntimeConfig({
      version: '1.0',
      models: { default: { provider, model } },
    })
    const adapter = createConfiguredModelAdapter(
      manifest,
      runtimeConfig,
      { environment: process.env },
      {
        requireProfiles: true,
        allowManifestOptions: false,
      },
    )
    if (!adapter) throw new Error('The agent does not reference a model.')
    return adapter
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'The configured model is invalid.')
  }
}
