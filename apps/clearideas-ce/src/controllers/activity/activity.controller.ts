import { hasSiteRole, postActivityBase, serializeActivity } from '@clearideas/core'
import { ForbiddenError } from '@clearideas/core/errors'
import type { Request, Response } from 'express'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'

export class ActivityController {
  constructor(private readonly ctx: CeAppContext) {}

  getAll = async (req: Request, res: Response) => {
    const activities = await this.ctx.models.ActivityModel.find({ user: req.sub })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    res.json(activities.map((x: any) => serializeActivity(x, { includeId: true, stringifyIds: true, includeTimestamps: true })))
  }

  getActivitiesForSite = async (req: Request, res: Response) => {
    const rows = await this.ctx.models.ActivityModel.find({
      parent: req.params.siteId,
      parentOnModel: 'Site',
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    res.json(rows.map((x: any) => serializeActivity(x, { includeId: true, stringifyIds: true, includeTimestamps: true })))
  }

  getActivitiesForFile = async (req: Request, res: Response) => {
    const rows = await this.ctx.models.ActivityModel.find({
      target: req.params.id,
      onModel: 'Content',
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    res.json(rows.map((x: any) => serializeActivity(x, { includeId: true, stringifyIds: true, includeTimestamps: true })))
  }

  postActivity = async (req: Request, res: Response) => {
    await this.authorizeActivityTarget(req)
    const result = await postActivityBase({
      activity: {
        user: req.sub,
        action: req.body.action,
        target: req.body.target,
        onModel: req.body.onModel,
        parent: req.body.parent,
        parentOnModel: req.body.parentOnModel,
        attributes: req.body.attributes,
      },
      writeActivity: activity => this.ctx.models.ActivityModel.create(activity),
    })
    res.status(201).json(result)
  }

  private async authorizeActivityTarget(req: Request) {
    const siteId = await this.resolveActivitySiteId(req)
    if (!siteId) return
    const site = await this.ctx.models.SiteModel.findById(siteId).lean()
    if (!site) throw new ForbiddenError('Site access denied')
    const { allowed } = hasSiteRole({
      site,
      accountId: req.accountId,
      userId: req.sub,
      permittedRoles: config.site.roles.allNonDisabledRoles,
      roles: config.site.roles,
    })
    if (!allowed && site.visibility !== config.site.visibility.public) throw new ForbiddenError('Site access denied')
  }

  private async resolveActivitySiteId(req: Request) {
    if (req.body.parentOnModel === 'Site' && req.body.parent) return String(req.body.parent)
    if (req.body.onModel === 'Site' && req.body.target) return String(req.body.target)
    if (req.body.onModel === 'Content' && req.body.target) {
      const content = await this.ctx.models.ContentModel.findById(req.body.target).select('site').lean()
      if (!content) throw new ForbiddenError('Site access denied')
      return String(content.site)
    }
    return ''
  }

  getMostActiveUsers = async (req: Request, res: Response) => {
    const match: any = { action: { $in: ['viewed'] } }
    if (req.params.siteId) {
      match.parent = req.params.siteId
      match.parentOnModel = 'Site'
    }
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: match },
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])
    res.json(rows.map((x: any) => ({ user: String(x._id), count: x.count })))
  }

  getHeatmap = async (req: Request, res: Response) => {
    const match: any = { action: 'viewed' }
    if (req.params.siteId) {
      match.parent = req.params.siteId
      match.parentOnModel = 'Site'
    }
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: '$_id.day', count: 1 } },
      { $sort: { date: 1 } },
    ])
    res.json(rows)
  }
}
