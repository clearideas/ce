import { BadRequestError } from '@clearideas/core/errors'
import type { Request, Response } from 'express'
import type { CeAppContext } from '../../lib/app-context.js'

export class NotificationController {
  constructor(private readonly ctx: CeAppContext) {}

  send = async (req: Request, res: Response) => {
    const to = String(req.body?.to ?? '').trim()
    const subject = String(req.body?.subject ?? '').trim()
    const body = String(req.body?.body ?? '').trim()
    if (!to || !subject || !body) {
      throw new BadRequestError('to, subject, and body are required')
    }
    await this.ctx.providers.email.send({ to, subject, text: body })
    res.status(202).json({ message: 'Notification queued' })
  }

  sendTemplate = async (req: Request, res: Response) => {
    const to = String(req.body?.to ?? '').trim()
    const template = String(req.body?.template ?? req.body?.templateAlias ?? '').trim()
    const variables = req.body?.variables ?? {}
    if (!to || !template) {
      throw new BadRequestError('to and template are required')
    }
    await this.ctx.providers.email.sendTemplate({ to, templateAlias: template, templateModel: variables })
    res.status(202).json({ message: 'Template notification queued' })
  }
}
