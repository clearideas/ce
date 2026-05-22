import { SiteChatRequestSchema } from '@clearideas/contracts-core'
import type { UIMessage } from 'ai'

type RequestSchema<T> = {
  safeParse: (payload: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<PropertyKey>; message: string }> } }
}

function validateRequest<T>(schema: RequestSchema<T>, payload: unknown, context: string): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  const message = result.error.issues
    .map(issue => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
    .join('; ')
  throw new Error(`${context} payload is invalid: ${message}`)
}

export function createSiteChatRequestBody(input: {
  messages: UIMessage[]
  selectedModel?: string
}) {
  return validateRequest(SiteChatRequestSchema, {
    messages: input.messages,
    ...(input.selectedModel ? { model: input.selectedModel } : {}),
  }, 'Site chat')
}

export function sanitizeSiteChatMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return []

  return value
    .map(message => sanitizeSiteChatMessage(message))
    .filter((message): message is UIMessage => message != null)
}

export function getRenderableSiteChatMessages(value: UIMessage[], isBusy = false): UIMessage[] {
  return value.filter((message, index) =>
    hasSiteChatMessageText(message) ||
    (isBusy && index === value.length - 1 && message.role === 'assistant')
  )
}

export function getSiteChatMessageText(message: Pick<UIMessage, 'parts'>) {
  const text = (message.parts ?? [])
    .filter((part: any) => part.type === 'text')
    .map((part: any) => part.text)
    .join('')
  return text || getSiteChatToolErrorText(message)
}

function sanitizeSiteChatMessage(value: unknown): UIMessage | null {
  if (!value || typeof value !== 'object') return null

  const message = value as { id?: unknown; role?: unknown; parts?: unknown }
  if (message.role !== 'user' && message.role !== 'assistant') return null
  if (!Array.isArray(message.parts)) return null

  const parts = message.parts
    .filter((part): part is { type: 'text'; text: string } =>
      Boolean(
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string' &&
        (part as { text: string }).text.trim(),
      ),
    )
    .map(part => ({ type: 'text' as const, text: part.text }))

  if (parts.length === 0) return null

  return {
    id: typeof message.id === 'string' && message.id ? message.id : crypto.randomUUID(),
    role: message.role,
    parts,
  } as UIMessage
}

function hasSiteChatMessageText(message: Pick<UIMessage, 'parts'>) {
  return getSiteChatMessageText(message).trim().length > 0
}

function getSiteChatToolErrorText(message: Pick<UIMessage, 'parts'>) {
  const errors = (message.parts ?? [])
    .map((part: any) => {
      if (!part || typeof part !== 'object' || !String(part.type ?? '').startsWith('tool-')) return ''
      const output = part.output
      if (output && typeof output === 'object' && typeof output.error === 'string') return output.error
      if (typeof part.errorText === 'string') return part.errorText
      return ''
    })
    .filter(Boolean)

  if (errors.length === 0) return ''
  return errors.join('\n')
}
