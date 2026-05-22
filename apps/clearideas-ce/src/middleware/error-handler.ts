import { BadRequestError, InternalServerError, type ApiError } from '@clearideas/core/errors'
import type { NextFunction, Request, Response } from 'express'

export function notFoundRoute(req: Request, _res: Response, next: NextFunction) {
  const err = new Error(`Route ${req.method} ${req.originalUrl} not found`) as ApiError
  err.statusCode = 404
  next(err)
}

function isApiError(error: Error): error is ApiError {
  return Number.isFinite((error as ApiError).statusCode)
}

function normalizeError(err: Error): ApiError {
  if (isApiError(err)) return err

  if (
    err.name === 'ZodError' ||
    err.name === 'ValidationError' ||
    err.name === 'CastError' ||
    err.name === 'StrictModeError'
  ) {
    return new BadRequestError('Invalid request.')
  }

  return new InternalServerError()
}

function shouldLogError(statusCode: number) {
  return statusCode >= 500 || process.env.NODE_ENV !== 'test'
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const apiErr = normalizeError(err)
  const statusCode = apiErr.statusCode
  if (shouldLogError(statusCode)) {
    console.error('[clearideas-ce:error]', {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      name: err.name,
      message: err.message,
      stack: err.stack,
    })
  }
  const message = statusCode >= 500 ? 'Internal Server Error' : apiErr.message
  const payload: Record<string, unknown> = { error: message }
  if (apiErr.errorCode) payload.errorCode = apiErr.errorCode
  res.status(statusCode).json(payload)
}
