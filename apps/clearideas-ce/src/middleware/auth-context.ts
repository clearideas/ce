import { fromNodeHeaders } from 'better-auth/node'
import { UnauthorizedError } from '@clearideas/core/errors'
import type { NextFunction, Request, Response } from 'express'
import type { Types } from 'mongoose'

type AuthApi = {
  getSession: (input: { headers: Headers }) => Promise<{ user?: { email?: string } } | null>
}

type UserDoc = {
  _id: Types.ObjectId
  email: string
  displayName?: string
  roles?: string[]
}

type AccountDoc = {
  _id: Types.ObjectId
  owner: Types.ObjectId
  name: string
}

type Models = {
  UserModel: {
    findOne: (filter: Record<string, unknown>) => { lean: () => Promise<UserDoc | null> }
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<unknown>
  }
  AccountModel: {
    findOne: (filter: Record<string, unknown>) => { lean: () => Promise<AccountDoc | null> }
  }
}

export function buildAuthContextMiddleware(auth: AuthApi, models: Models) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const session = await auth.getSession({ headers: fromNodeHeaders(req.headers) })
      if (!session?.user?.email) {
        return next(new UnauthorizedError('Not authenticated'))
      }

      const user = await models.UserModel.findOne({ email: session.user.email }).lean()
      if (!user) {
        return next(new UnauthorizedError('No local CE user record for authenticated user'))
      }

      const account = await models.AccountModel.findOne({ owner: user._id }).lean()
      if (!account) {
        return next(new UnauthorizedError('No local CE account record for authenticated user'))
      }

      req.sub = user._id
      req.user = user
      req.accountId = account._id
      req.account = account
      await models.UserModel.updateOne({ _id: user._id }, { $set: { lastActive: new Date() } })
      next()
    } catch (error: any) {
      return next(new UnauthorizedError(error?.message ?? 'Not authenticated'))
    }
  }
}

export function requireAuthContext(req: Request, _res: Response, next: NextFunction) {
  if (!req.sub || !req.accountId || !req.user || !req.account) {
    return next(new UnauthorizedError('Not authenticated'))
  }
  next()
}
