export interface McpTextContent {
  type: 'text'
  text: string
}

export interface McpResponse {
  content: McpTextContent[]
  structuredContent?: unknown
  _meta?: Record<string, unknown>
  isError?: boolean
}

const genericMcpErrorMessage =
  'The MCP request could not be completed. Please retry or contact support with the trace ID.'

const unsafeMcpErrorPatterns = [
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError)\b/i,
  /\bCannot\s+(?:read|set|access|convert)\b/i,
  /\bundefined\b.*\b(?:reading|properties|property)\b/i,
  /\b(?:stack|trace|at\s+[A-Za-z0-9_$.[\]/:-]+\s*\()/i,
  /\b(?:node_modules|dist\/|src\/|\.ts:\d+|\.js:\d+|\/Users\/|\/home\/|\/var\/|\/tmp\/)\b/i,
  /\b(?:Mongo|Mongoose|CastError|E11000|Redis|S3|AWS|Stripe|Modal|CloudWatch|SQS|KMS)\b/i,
  /\b(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNABORTED)\b/i,
  /\b(?:secret|password|credential|authorization|bearer|private\s*key|api\s*key)\b/i,
  /\b(?:token|signature)\s*[:=]\s*\S+/i,
  /\b(?:mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|redis:\/\/|mysql:\/\/)\S+/i,
  /\b[A-Za-z0-9_+/=-]{48,}\b/,
]

const isUnsafeMcpErrorText = (value: string): boolean => {
  const text = value.trim()
  if (!text) return false
  if (text.length > 500) return true
  return unsafeMcpErrorPatterns.some(pattern => pattern.test(text))
}

const sanitizeMcpErrorText = (value: string | undefined, fallback: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return isUnsafeMcpErrorText(trimmed) ? fallback : trimmed
}

export function sanitizeMcpClientError(
  error: string,
  message?: string,
): { error: string; message?: string } {
  const sanitizedError = sanitizeMcpErrorText(error, 'MCP request failed') ?? 'MCP request failed'
  const sanitizedMessage = sanitizeMcpErrorText(message, genericMcpErrorMessage)
  return {
    error: sanitizedError,
    ...(sanitizedMessage ? { message: sanitizedMessage } : {}),
  }
}

export function createMcpErrorResponse(input: {
  error: string
  message?: string
  traceId?: string
}): McpResponse {
  const sanitized = sanitizeMcpClientError(input.error, input.message)
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: sanitized.message ? `${sanitized.error}: ${sanitized.message}` : sanitized.error,
      },
    ],
    structuredContent: {
      error: sanitized.error,
      ...(sanitized.message ? { message: sanitized.message } : {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
    },
    _meta: input.traceId ? { traceId: input.traceId } : {},
  }
}

export function createMcpSuccessResponse(input: {
  data: unknown
  traceId: string
  text: string
  meta?: Record<string, unknown>
}): McpResponse {
  const structuredContent =
    input.data != null && typeof input.data === 'object' && !Array.isArray(input.data)
      ? { ...(input.data as Record<string, unknown>), traceId: input.traceId }
      : { data: input.data, traceId: input.traceId }
  return {
    content: [{ type: 'text', text: input.text }],
    structuredContent,
    _meta: { traceId: input.traceId, ...(input.meta ?? {}) },
  }
}

export function hasMcpScope(
  scopes: readonly string[] | undefined,
  requiredScope: 'read' | 'write',
): boolean {
  if (!scopes) return true
  const required = `mcp:${requiredScope}`
  return scopes.includes(required)
}

export function generateMcpContentUrl(input: {
  appBaseUrl: string
  siteId: string
  contentId: string
  kind?: string
}): string {
  return input.kind === 'file'
    ? generateMcpAppUrl(input.appBaseUrl, `/site/${input.siteId}/file/${input.contentId}`)
    : generateMcpAppUrl(input.appBaseUrl, `/site/${input.siteId}/${input.contentId}`)
}

export function generateMcpAppUrl(appBaseUrl: string, path: string): string {
  return `${trimTrailingSlashes(appBaseUrl)}/${path.replace(/^\/+/, '')}`
}

export function generateMcpSiteUrl(input: { appBaseUrl: string; siteId: string }): string {
  return generateMcpAppUrl(input.appBaseUrl, `/site/${input.siteId}`)
}

export function generateMcpAgentUrl(input: { appBaseUrl: string; agentId: string }): string {
  return generateMcpAppUrl(input.appBaseUrl, `/agents/workflow/${input.agentId}`)
}

export function generateMcpAgentRunUrl(input: { appBaseUrl: string; agentRunId: string }): string {
  return generateMcpAppUrl(input.appBaseUrl, `/agents/run/${input.agentRunId}`)
}

function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

export function normalizeMcpRequest(body: any): {
  method?: string
  tool: string
  args: Record<string, unknown>
} {
  const method = typeof body?.method === 'string' ? body.method.trim() : undefined
  if (method === 'tools/call') {
    return {
      method,
      tool: String(body?.params?.name ?? '').trim(),
      args: (body?.params?.arguments ?? {}) as Record<string, unknown>,
    }
  }
  return {
    method,
    tool: String(body?.tool ?? '').trim(),
    args: (body?.args ?? {}) as Record<string, unknown>,
  }
}

export function toMcpJsonRpcResponse(request: any, result: Record<string, unknown>) {
  if (request?.jsonrpc === '2.0' || request?.id != null) {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: request?.method === 'tools/call' ? toMcpToolResult(result) : result,
    }
  }
  return { ok: true, result }
}

export function toMcpToolResult(result: Record<string, unknown>) {
  return {
    content: [{ type: 'text', text: getMcpToolText(result) }],
    structuredContent: result,
  }
}

export function getMcpToolText(result: Record<string, unknown>): string {
  if (typeof result.content === 'string') return result.content
  return JSON.stringify(result, null, 2)
}

export function sliceTextContent(
  text: string,
  input: { maxTokens: number; lines?: { start?: number; end?: number } },
) {
  const allLines = text.split(/\r?\n/)
  const requestedStart = Number(input.lines?.start ?? 1)
  const requestedEnd = Number(input.lines?.end ?? allLines.length)
  const lineStart = Math.max(1, Number.isFinite(requestedStart) ? requestedStart : 1)
  const lineEnd = Math.min(
    allLines.length,
    Number.isFinite(requestedEnd) ? requestedEnd : allLines.length,
  )
  const lineText = allLines.slice(lineStart - 1, lineEnd).join('\n')
  const maxChars = Math.max(1, Math.min(input.maxTokens || 8000, 32000)) * 4
  const truncated = lineText.length > maxChars
  return {
    text: truncated ? lineText.slice(0, maxChars) : lineText,
    truncated,
    lineStart,
    lineEnd,
  }
}
