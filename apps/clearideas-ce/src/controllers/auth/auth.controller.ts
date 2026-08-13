import { BadRequestError, ForbiddenError, UnauthorizedError } from '@clearideas/core/errors'
import { createDefaultUserAttributes } from '@clearideas/core'
import { fromNodeHeaders } from 'better-auth/node'
import type { Request, Response as ExpressResponse } from 'express'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'

export class AuthController {
  constructor(private readonly ctx: CeAppContext) {}

  sendCode = async (req: Request, res: ExpressResponse) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    if (!(await this.emailCanSignIn(email))) {
      throw new ForbiddenError('This email has not been invited to Clear Ideas.')
    }
    try {
      await this.ctx.auth.api.sendVerificationOTP({
        headers: fromNodeHeaders(req.headers),
        body: { email, type: 'sign-in' },
      })
      res.json({ success: true })
    } catch (error: any) {
      throw new BadRequestError(error?.message ?? 'Could not send sign-in code')
    }
  }

  verifyCode = async (req: Request, res: ExpressResponse) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase()
      const code = String(req.body?.code ?? '').replace(/\D/g, '')
      const name = String(req.body?.name ?? '').trim() || email.split('@')[0] || 'CE User'

      // Check local admission before Better Auth consumes a valid one-time code.
      // This lets an operator invite the address and retry the same unexpired code,
      // and prevents a misleading "Invalid OTP" on the second submission.
      if (!(await this.emailCanSignIn(email))) {
        throw new UnauthorizedError('This email has not been invited to Clear Ideas.')
      }

      const authResponse = await this.ctx.auth.api.signInEmailOTP({
        asResponse: true,
        headers: fromNodeHeaders(req.headers),
        body: { email, otp: code, name },
      })
      if (!authResponse.ok) throw new UnauthorizedError(await getAuthErrorMessage(authResponse, 'Invalid or expired code'))
      applyResponseCookies(res, authResponse)

      const domainUser = await this.ensureDomainUser(email, name)

      res.json({
        user: {
          id: String(domainUser._id),
          email: domainUser.email,
          name: domainUser.displayName ?? domainUser.email,
        },
      })
    } catch (error: any) {
      throw new UnauthorizedError(error?.message ?? 'Invalid or expired code')
    }
  }

  logout = async (req: Request, res: ExpressResponse) => {
    const authResponse = await this.ctx.auth.api.signOut({
      asResponse: true,
      headers: fromNodeHeaders(req.headers),
    })
    applyResponseCookies(res, authResponse)
    res.json({ ok: true })
  }

  session = async (req: Request, res: ExpressResponse) => {
    const user = await this.ctx.models.UserModel.findById(req.sub!).lean()
    res.json({ user: { id: String(user!._id), email: user!.email, name: user!.displayName ?? user!.email } })
  }

  private async emailCanSignIn(email: string) {
    const existingUser = await this.ctx.models.UserModel.findOne({ email }).select('_id').lean()
    if (existingUser) return true
    return (await this.ctx.models.UserModel.estimatedDocumentCount()) === 0
  }

  private async ensureDomainUser(email: string, name: string) {
    let domainUser = await this.ctx.models.UserModel.findOne({ email })
    if (!domainUser) {
      const existingUserCount = await this.ctx.models.UserModel.estimatedDocumentCount()
      if (existingUserCount > 0) {
        throw new UnauthorizedError('This email has not been invited to Clear Ideas.')
      }
      domainUser = await this.ctx.models.UserModel.create({
        email,
        displayName: name,
        status: config.user.activeStatus,
        roles: config.user.firstUserRoles,
        attributes: createDefaultUserAttributes(),
      })
      await this.ctx.models.AccountModel.create({
        name: `${name}'s Workspace`,
        owner: domainUser._id,
        attributes: {},
      })
      return domainUser
    }
    if (domainUser.status && domainUser.status !== config.user.activeStatus) {
      domainUser.status = config.user.activeStatus
      await domainUser.save()
    }
    return domainUser
  }
}

function applyResponseCookies(res: ExpressResponse, response: globalThis.Response) {
  const headers = response.headers
  const getSetCookie = (headers as any).getSetCookie as (() => string[]) | undefined
  if (getSetCookie) {
    const cookies = getSetCookie.call(headers)
    if (cookies.length > 0) res.setHeader('set-cookie', cookies)
    return
  }
  const cookieHeader = headers.get('set-cookie')
  if (cookieHeader) res.setHeader('set-cookie', cookieHeader)
}

async function getAuthErrorMessage(response: globalThis.Response, fallback: string): Promise<string> {
  try {
    const body = await response.clone().json()
    return String(body?.message ?? body?.error ?? fallback)
  } catch {
    return fallback
  }
}
