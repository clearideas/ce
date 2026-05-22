import { EmptyObjectRequestSchema } from '@clearideas/contracts-core'

type RequestSchema<T> = {
  safeParse: (payload: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<PropertyKey>; message: string }> } }
}

type FetchPrivateOptions = RequestInit & {
  bodySchema?: RequestSchema<unknown>
  retryOnUnauthorized?: boolean
}

export class FetchPrivateError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'FetchPrivateError'
    this.status = status
    this.body = body
  }
}

let unauthorizedHandler: (() => void | Promise<void>) | null = null
let sessionRefreshPromise: Promise<boolean> | null = null

export function setUnauthorizedHandler(handler: (() => void | Promise<void>) | null) {
  unauthorizedHandler = handler
}

export async function fetchPrivate<T>(path: string, options: FetchPrivateOptions = {}): Promise<T> {
  const response = await request(path, options)
  if (response.status === 401 && options.retryOnUnauthorized !== false) {
    const refreshed = await refreshBetterAuthSession()
    if (refreshed) {
      const retry = await request(path, { ...options, retryOnUnauthorized: false })
      return parseResponse<T>(retry)
    }
    await unauthorizedHandler?.()
  }
  return parseResponse<T>(response)
}

export async function refreshBetterAuthSession(): Promise<boolean> {
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = refreshBetterAuthSessionOnce().finally(() => {
      sessionRefreshPromise = null
    })
  }
  return sessionRefreshPromise
}

async function refreshBetterAuthSessionOnce(): Promise<boolean> {
  const current = await request('/api/auth/get-session', { method: 'GET', retryOnUnauthorized: false })
  if (!current.ok) return false
  const currentBody = await parseBody(current)
  if (!hasBetterAuthSession(currentBody)) return false

  if ((currentBody as any).needsRefresh === true) {
    const refreshed = await request('/api/auth/get-session', {
      method: 'POST',
      bodySchema: EmptyObjectRequestSchema,
      body: JSON.stringify(validateRequest(EmptyObjectRequestSchema, {}, 'Refresh session')),
      retryOnUnauthorized: false,
    })
    if (!refreshed.ok) return false
    return hasBetterAuthSession(await parseBody(refreshed))
  }

  return true
}

async function request(path: string, options: FetchPrivateOptions = {}) {
  const { bodySchema: _bodySchema, retryOnUnauthorized: _retryOnUnauthorized, ...fetchOptions } = options
  const headers = new Headers(options.headers)
  if (options.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return fetch(path, {
    ...fetchOptions,
    credentials: 'include',
    headers,
  })
}

function validateRequest<T>(schema: RequestSchema<T>, payload: unknown, context: string): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  const message = result.error.issues
    .map(issue => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
    .join('; ')
  throw new Error(`${context} payload is invalid: ${message}`)
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await parseBody(response)
  if (!response.ok) {
    const message = typeof body === 'string' ? body : (body as any)?.error || (body as any)?.message || response.statusText
    throw new FetchPrivateError(message, response.status, body)
  }
  return body as T
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return response.json()
  return response.text()
}

function hasBetterAuthSession(value: unknown) {
  return Boolean(value && typeof value === 'object' && (value as any).session && (value as any).user)
}
