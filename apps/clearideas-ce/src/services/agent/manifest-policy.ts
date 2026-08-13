import {
  parseAgentManifest,
  type AgentManifest,
  type AgentStep,
  type ModelReference,
} from '@clearideas/agent-runtime'
import { BadRequestError } from '@clearideas/core/errors'

export const CE_AGENT_TOOLS = [
  'list_content',
  'get_site_metadata',
  'get_content_metadata',
  'search_content',
  'retrieve_file_content',
] as const

const allowedTools = new Set<string>(CE_AGENT_TOOLS)

export function validateCeAgentManifest(input: unknown): AgentManifest {
  let inputBytes = 0
  try {
    inputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8')
  } catch {
    throw new BadRequestError('Agent manifest must be JSON serializable.')
  }
  if (inputBytes > 250_000) throw new BadRequestError('Agent manifest exceeds 250 KB.')

  let parsed: AgentManifest
  try {
    parsed = parseAgentManifest(input)
  } catch (error) {
    throw new BadRequestError(formatManifestError(error))
  }

  if (!parsed.name?.trim()) throw new BadRequestError('Agent manifest name is required.')
  if (parsed.steps.length === 0) throw new BadRequestError('Agent manifest needs at least one step.')
  if (parsed.steps.length > 20) throw new BadRequestError('Agent manifests can contain at most 20 steps.')
  if (parsed.connections?.length) {
    throw new BadRequestError('Connections are not supported by this edition.')
  }

  assertDefaultModel(parsed.model, 'Agent')
  for (const step of parsed.steps) assertSupportedStep(step)

  return {
    ...parsed,
    model: parsed.model ?? { ref: 'default' },
    limits: {
      ...parsed.limits,
      maxSteps: Math.min(parsed.limits?.maxSteps ?? 20, 20),
      maxMessagesPerPrompt: Math.min(parsed.limits?.maxMessagesPerPrompt ?? 30, 30),
      maxInputBytes: Math.min(parsed.limits?.maxInputBytes ?? 100_000, 100_000),
      maxOutputBytes: Math.min(parsed.limits?.maxOutputBytes ?? 200_000, 200_000),
      maxToolCallsPerIteration: Math.min(parsed.limits?.maxToolCallsPerIteration ?? 10, 10),
      providerTimeoutMs: Math.min(parsed.limits?.providerTimeoutMs ?? 120_000, 120_000),
    },
  }
}

export function manifestUsesSiteTools(manifest: AgentManifest): boolean {
  return manifest.steps.some(step => step.type === 'prompt' && Boolean(step.tools?.length))
}

function assertSupportedStep(step: AgentStep) {
  if (step.type !== 'prompt') {
    throw new BadRequestError(`Step type "${step.type}" is not supported by this edition.`)
  }
  assertDefaultModel(step.model, `Step "${step.id}"`)
  for (const tool of step.tools ?? []) {
    if (!allowedTools.has(tool)) throw new BadRequestError(`Tool "${tool}" is not supported.`)
  }
}

function assertDefaultModel(model: ModelReference | undefined, subject: string) {
  if (!model) return
  if ('ref' in model && model.ref === 'default' && !model.options) return
  throw new BadRequestError(`${subject} must use the host configured default model.`)
}

function formatManifestError(error: unknown): string {
  if (error instanceof Error && error.message) return `Invalid agent manifest: ${error.message}`
  return 'Invalid agent manifest.'
}
