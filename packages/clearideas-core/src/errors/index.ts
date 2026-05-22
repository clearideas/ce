export interface ApiError extends Error {
  statusCode: number
  errorCode?: string
}

export class BadRequestError extends Error implements ApiError {
  statusCode = 400
  constructor(message = 'Bad request.') {
    super(message)
    Object.setPrototypeOf(this, BadRequestError.prototype)
  }
}

export class UnauthorizedError extends Error implements ApiError {
  statusCode = 401
  constructor(message = 'User not authenticated.') {
    super(message)
    Object.setPrototypeOf(this, UnauthorizedError.prototype)
  }
}

export class ForbiddenError extends Error implements ApiError {
  statusCode = 403
  errorCode?: string
  constructor(message = 'Access denied.', errorCode?: string) {
    super(message)
    this.errorCode = errorCode
    Object.setPrototypeOf(this, ForbiddenError.prototype)
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404
  constructor(message = 'Resource not found.') {
    super(message)
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409
  constructor(message = 'Conflict.') {
    super(message)
    Object.setPrototypeOf(this, ConflictError.prototype)
  }
}

export class TooManyRequestsError extends Error implements ApiError {
  statusCode = 429
  constructor(message = 'Too many requests.') {
    super(message)
    Object.setPrototypeOf(this, TooManyRequestsError.prototype)
  }
}

export class InternalServerError extends Error implements ApiError {
  statusCode = 500
  constructor(message = 'Internal server error.') {
    super(message)
    Object.setPrototypeOf(this, InternalServerError.prototype)
  }
}
