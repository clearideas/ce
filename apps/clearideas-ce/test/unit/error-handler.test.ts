import { BadRequestError } from '@clearideas/core/errors'
import mongoose from 'mongoose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../../src/middleware/error-handler.js'

function createResponse() {
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code
      return res
    }),
    json: vi.fn((payload: unknown) => {
      res.payload = payload
      return res
    }),
  }
  return res
}

function createRequest() {
  return {
    method: 'PUT',
    originalUrl: '/api/sites/site-1',
  } as any
}

describe('CE error handler', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
  })

  it('keeps explicit API errors clear for clients', () => {
    process.env.NODE_ENV = 'development'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = createResponse()

    errorHandler(new BadRequestError('Name is required'), createRequest(), res as any, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Name is required' })
    expect(consoleError).toHaveBeenCalled()
  })

  it('sanitizes raw Mongoose validation errors while logging details server-side', () => {
    process.env.NODE_ENV = 'development'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = createResponse()
    const error = new mongoose.Error.ValidationError()
    error.addError('members.0.user', new mongoose.Error.ValidatorError({ path: 'members.0.user', message: 'Path `user` is required.' }))

    errorHandler(error, createRequest(), res as any, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid request.' })
    expect(consoleError).toHaveBeenCalledWith('[clearideas-ce:error]', expect.objectContaining({
      name: 'ValidationError',
      message: expect.stringContaining('members.0.user'),
      statusCode: 400,
    }))
  })
})
