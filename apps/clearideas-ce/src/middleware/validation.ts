import { createValidationMiddleware, type CoreValidationSchema } from '@clearideas/core'
import type { RequestHandler } from 'express'

const validation = createValidationMiddleware()

export function validateBody<T>(schema: CoreValidationSchema<T>): RequestHandler {
  return validation.validateBody(schema) as RequestHandler
}

export function validateParams<T>(schema: CoreValidationSchema<T>): RequestHandler {
  return validation.validateParams(schema) as RequestHandler
}

export function validateQuery<T>(schema: CoreValidationSchema<T>): RequestHandler {
  return validation.validateQuery(schema) as RequestHandler
}
