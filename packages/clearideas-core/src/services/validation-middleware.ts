import { BadRequestError } from '../errors/index.js'

export type ZodLikeValidationResult<T = unknown> =
  | { success: true; data: T }
  | {
      success: false
      error: {
        issues?: unknown[]
        message?: string
      }
    }

export type ZodLikeValidationSchema<T = unknown> = {
  safeParseAsync?: (value: unknown) => Promise<ZodLikeValidationResult<T>>
  safeParse?: (value: unknown) => ZodLikeValidationResult<T>
}

export type CoreValidationSchema<T = unknown> = ZodLikeValidationSchema<T>

export interface RequestLike {
  body?: unknown
  cookies?: unknown
  headers?: unknown
  params?: unknown
  query?: unknown
}

export type RequestHandlerLike = (req: any, res: any, next: (error?: unknown) => void) => void | Promise<void>

export interface ValidationMiddlewareOptions {
  createBadRequestError?: (message: string) => unknown
  createEmailInUseError?: () => unknown
  logValidationError?: (error: unknown, req: RequestLike) => void
}

function formatPath(path: PropertyKey[] = []): string {
  return path
    .map((part, index) => typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`)
    .join('')
}

function formatIssue(issue: { path?: PropertyKey[]; message?: string; code?: string; [key: string]: unknown }): string {
  const path = formatPath(issue.path ?? [])
  if (
    (issue.code === 'invalid_type' || issue.code === 'invalid_value') &&
    issue.input === undefined &&
    path
  ) {
    return `"${path}" is required`
  }
  if (issue.code === 'custom') return issue.message ?? 'Invalid value'
  if (issue.code === 'invalid_union') {
    if (path) return `"${path}" is required`
    const nested = (issue.errors as Array<Array<typeof issue>> | undefined)?.flat() ?? []
    return nested.length > 0 ? nested.map(formatIssue).join('; ') : issue.message ?? 'Invalid value'
  }
  if (issue.code === 'unrecognized_keys') {
    return 'Invalid request.'
  }
  if (issue.code === 'too_small' && issue.origin === 'number' && path) {
    const comparator = issue.inclusive === true ? 'greater than or equal to' : 'greater than'
    return `"${path}" must be ${comparator} ${String(issue.minimum)}`
  }
  return path ? `"${path}" ${issue.message ?? 'is invalid'}` : issue.message ?? 'Invalid value'
}

function formatZodError(error: { issues?: unknown[]; message?: string }): string {
  const [firstIssue] = error.issues ?? []
  return firstIssue
    ? formatIssue(firstIssue as { path?: PropertyKey[]; message?: string; code?: string; [key: string]: unknown })
    : error.message || 'Invalid request'
}

export async function validateSchema<T>(schema: CoreValidationSchema<T>, value: unknown): Promise<T> {
  const result = schema.safeParseAsync
    ? await schema.safeParseAsync(value)
    : schema.safeParse!(value)
  if (result.success) return result.data
  throw new BadRequestError(formatZodError(result.error))
}

export function createValidationMiddleware(options: ValidationMiddlewareOptions = {}) {
  const createBadRequestError = options.createBadRequestError ?? ((message: string) => new BadRequestError(message))

  const handleValidationError = (error: any, req: RequestLike, next: (error?: unknown) => void) => {
    const message = String(error?.message ?? 'Invalid request')
    if (message.startsWith('Email is already in use') && options.createEmailInUseError) {
      next(options.createEmailInUseError())
      return
    }
    options.logValidationError?.(error, req)
    next(createBadRequestError(message))
  }

  const validate = (schema: CoreValidationSchema, obj: unknown): RequestHandlerLike => {
    return async (req: RequestLike, _res: unknown, next: (error?: unknown) => void) => {
      try {
        await validateSchema(schema, obj)
        next()
      } catch (error) {
        handleValidationError(error, req, next)
      }
    }
  }

  const validatePart = <T>(
    schema: CoreValidationSchema<T>,
    source: (req: RequestLike) => unknown,
    assign?: (req: RequestLike, value: T) => void,
  ): RequestHandlerLike => {
    return async (req: RequestLike, _res: unknown, next: (error?: unknown) => void) => {
      try {
        const validated = await validateSchema(schema, source(req))
        assign?.(req, validated)
        next()
      } catch (error) {
        handleValidationError(error, req, next)
      }
    }
  }

  return {
    validate,
    validateBodyOrCookies: (schema: CoreValidationSchema) =>
      validatePart(schema, req => ({ ...((req.cookies as object | undefined) ?? {}), ...((req.body as object | undefined) ?? {}) })),
    validateBody: (schema: CoreValidationSchema) =>
      validatePart(schema, req => req.body ?? {}, (req, value) => {
        req.body = value
      }),
    validateParams: (schema: CoreValidationSchema) =>
      validatePart(schema, req => req.params ?? {}, (req, value) => {
        req.params = value
      }),
    validateCookie: (schema: CoreValidationSchema) =>
      validatePart(schema, req => req.cookies ?? {}, (req, value) => {
        req.cookies = value
      }),
    validateQuery: (schema: CoreValidationSchema) =>
      validatePart(schema, req => req.query ?? {}, (req, value) => {
        Object.defineProperty(req, 'query', {
          configurable: true,
          enumerable: true,
          value: { ...((req.query as object | undefined) ?? {}), ...(value as object) },
          writable: true,
        })
      }),
    validateHeaders: (schema: CoreValidationSchema) =>
      validatePart(schema, req => req.headers ?? {}, (req, value) => {
        req.headers = value
      }),
  }
}
