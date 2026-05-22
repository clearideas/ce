import {
  castSiteQueryIds,
  clampLimit,
  daysAgoStart,
  getPermittedSiteIdsBase,
  humanizeAction,
  normalizeStringArray,
  normalizeTimeZone,
  parseAnalyticsDate,
} from '@clearideas/core'
import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'

type AnalyticsFilter = {
  sites: string[]
  actions: string[]
  startDate?: Date
  endDate?: Date
  limit: number
  timeZone: string
}

type ContentLookup = {
  id: string
  name: string
  siteId: string
  siteName: string
  size: number
  contentType?: string
}

export class AnalyticsController {
  constructor(private readonly ctx: CeAppContext) {}

  postMostActiveUsers = async (req: Request, res: Response) => {
    const filter = await this.resolveFilter(req)
    const match = this.activityMatch(filter)
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: match },
      { $group: { _id: '$user', viewCount: { $sum: 1 }, lastActive: { $max: '$createdAt' } } },
      { $sort: { viewCount: -1, lastActive: -1 } },
      { $limit: filter.limit },
    ])

    const usersById = await this.usersById(rows.map((row: any) => row._id))
    res.json({
      rows: rows.map((row: any) => {
        const user = usersById.get(String(row._id))
        return {
          id: String(row._id),
          name: user?.displayName ?? user?.email ?? 'Unknown user',
          email: user?.email ?? '',
          viewCount: row.viewCount,
          lastActive: row.lastActive,
        }
      }),
    })
  }

  postMostAccessed = async (req: Request, res: Response) => {
    const filter = await this.resolveFilter(req)
    const rows = await this.mostAccessedContent(filter)
    res.json({ rows })
  }

  postUsageTimes = async (req: Request, res: Response) => {
    const filter = await this.resolveFilter(req)
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: this.activityMatch(filter) },
      { $group: { _id: { hour: { $hour: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.hour': 1 } },
    ])
    res.json({
      rows: Array.from({ length: 24 }, (_, hour) => {
        const row = rows.find((item: any) => Number(item._id.hour) === hour)
        return { hour, name: `${hour.toString().padStart(2, '0')}:00`, count: row?.count ?? 0 }
      }),
    })
  }

  postContentActivity = async (req: Request, res: Response) => {
    const filter = await this.resolveFilter(req)
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: this.activityMatch(filter) },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: filter.limit },
    ])
    res.json({ rows: rows.map((row: any) => ({ action: String(row._id), name: humanizeAction(String(row._id)), count: row.count })) })
  }

  postMonthlyActiveUsers = async (req: Request, res: Response) => {
    const filter = await this.resolveFilter(req, { defaultStartDaysAgo: 30 })
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: this.activityMatch(filter) },
      { $group: { _id: '$user' } },
      { $count: 'count' },
    ])
    res.json({ monthlyActiveUsers: rows[0]?.count ?? 0 })
  }

  getDashboard = async (req: Request, res: Response) => {
    const filter = await this.resolveFilter(req, { defaultStartDaysAgo: 30, defaultLimit: 5 })
    const accountId = req.accountId
    const siteIds = filter.sites

    const [contentStats, usersCount, activityCount, monthlyActiveUsers, mostAccessedContent, mostActiveUsers, contentActivity] = await Promise.all([
      this.contentStats(siteIds),
      this.userCountForSites(siteIds),
      this.ctx.models.ActivityModel.countDocuments(this.activityMatch(filter)),
      this.monthlyActiveUserCount(filter),
      this.mostAccessedContent(filter),
      this.mostActiveUsers(filter),
      this.contentActivity(filter),
    ])

    res.json({
      totalSites: await this.ctx.models.SiteModel.countDocuments({ owner: accountId }),
      totalOwnedOrAdministeredSites: siteIds.length,
      totalUsers: usersCount,
      totalContent: contentStats.totalFiles,
      totalIndex: contentStats.totalFiles,
      storageSize: contentStats.storageSize,
      activityCount,
      monthlyActiveUsers,
      mostAccessedContent,
      mostActiveUsers,
      contentActivity,
    })
  }

  private async resolveFilter(req: Request, options: { defaultStartDaysAgo?: number; defaultLimit?: number } = {}): Promise<AnalyticsFilter> {
    const requestedSites = normalizeStringArray(req.body?.sites ?? req.query?.sites ?? req.body?.siteIds ?? req.query?.siteIds ?? req.body?.siteId ?? req.query?.siteId ?? req.params.siteId)
    const sites = await this.permittedSiteIds({
      userId: String(req.sub!),
      accountId: String(req.accountId ?? ''),
      requestedSites,
      roles: config.site.roles.adminRoles,
    })
    const timeZone = normalizeTimeZone(req.body?.timeZone ?? req.query?.timeZone)
    const startDate = parseAnalyticsDate(req.body?.startDate ?? req.query?.startDate, { timeZone })
    const endDate = parseAnalyticsDate(req.body?.endDate ?? req.query?.endDate, { timeZone, endOfDay: true })
    const fallbackStartDate = options.defaultStartDaysAgo ? daysAgoStart(options.defaultStartDaysAgo, timeZone) : undefined
    const actions = normalizeStringArray(req.body?.actions ?? req.query?.actions)
    const limit = clampLimit(req.body?.limit, options.defaultLimit ?? 20)

    return {
      sites,
      actions: actions.length > 0 ? actions : [...config.analytics.defaultActions],
      startDate: startDate ?? fallbackStartDate,
      endDate,
      limit,
      timeZone,
    }
  }

  private activityMatch(filter: AnalyticsFilter) {
    const match: any = {
      parentOnModel: 'Site',
      parent: { $in: filter.sites.map(id => new Types.ObjectId(id)) },
    }
    if (filter.actions.length > 0) match.action = { $in: filter.actions }
    if (filter.startDate || filter.endDate) {
      match.createdAt = {}
      if (filter.startDate) match.createdAt.$gte = filter.startDate
      if (filter.endDate) match.createdAt.$lte = filter.endDate
    }
    return match
  }

  private async permittedSiteIds(input: {
    userId: string
    accountId: string
    requestedSites?: string[]
    roles: readonly string[]
  }) {
    return getPermittedSiteIdsBase(
      {
        findSiteIds: async query => {
          const rows = await this.ctx.models.SiteModel.find(castSiteQueryIds(query)).select('_id').lean()
          return rows.map((site: any) => String(site._id))
        },
      },
      {
        accountId: input.accountId,
        userId: input.userId,
        roles: input.roles,
        ownerRoles: config.site.roles.ownerRoles,
        siteIds: input.requestedSites,
      },
    )
  }

  private async usersById(ids: unknown[]) {
    const objectIds = ids.filter((id: any) => Types.ObjectId.isValid(String(id))).map((id: any) => new Types.ObjectId(String(id)))
    const users = await this.ctx.models.UserModel.find({ _id: { $in: objectIds } }).select('email displayName').lean()
    return new Map<string, any>(users.map((user: any) => [String(user._id), user]))
  }

  private async userCountForSites(siteIds: string[]) {
    if (siteIds.length === 0) return 0
    const sites = await this.ctx.models.SiteModel.find({ _id: { $in: siteIds.map(id => new Types.ObjectId(id)) } }).select('owner members.user').lean()
    const accountIds = [...new Set(sites.map((site: any) => String(site.owner ?? '')).filter(Boolean))]
    const accounts = accountIds.length > 0
      ? await this.ctx.models.AccountModel.find({ _id: { $in: accountIds.map(id => new Types.ObjectId(String(id))) } }).select('owner').lean()
      : []
    const userIds = new Set<string>()
    for (const account of accounts) if (account.owner) userIds.add(String(account.owner))
    for (const site of sites) {
      for (const member of site.members ?? []) {
        const memberId = member?.user?._id ?? member?.user
        if (memberId) userIds.add(String(memberId))
      }
    }
    return userIds.size
  }

  private async contentById(siteIds: string[]) {
    const [files, sites] = await Promise.all([
      this.ctx.models.ContentModel.find({
        site: { $in: siteIds.map(id => new Types.ObjectId(id)) },
        kind: 'File',
      }).lean(),
      this.ctx.models.SiteModel.find({ _id: { $in: siteIds.map(id => new Types.ObjectId(id)) } }).select('_id name').lean(),
    ])
    const sitesById = new Map<string, any>(sites.map((site: any) => [String(site._id), site]))
    const map = new Map<string, ContentLookup>()
    for (const file of files) map.set(String(file._id), {
      id: String(file._id),
      name: file.name,
      siteId: String(file.site),
      siteName: sitesById.get(String(file.site))?.name ?? '',
      size: file.size ?? 0,
      contentType: file.contentType,
    })
    return map
  }

  private async contentStats(siteIds: string[]) {
    const rows = await this.ctx.models.ContentModel.aggregate([
      { $match: { site: { $in: siteIds.map(id => new Types.ObjectId(id)) }, kind: 'File' } },
      { $group: { _id: null, totalFiles: { $sum: 1 }, storageSize: { $sum: { $ifNull: ['$size', 0] } } } },
    ])
    return {
      totalFiles: rows[0]?.totalFiles ?? 0,
      storageSize: rows[0]?.storageSize ?? 0,
    }
  }

  private async mostAccessedContent(filter: AnalyticsFilter) {
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: { ...this.activityMatch(filter), onModel: 'Content' } },
      { $group: { _id: '$target', viewCount: { $sum: 1 }, lastViewedAt: { $max: '$createdAt' } } },
      { $sort: { viewCount: -1, lastViewedAt: -1 } },
      { $limit: filter.limit },
    ])
    const contentById = await this.contentById(filter.sites)
    return rows.map((row: any) => {
      const content = contentById.get(String(row._id))
      return {
        id: String(row._id),
        name: content?.name ?? 'Unknown content',
        siteId: content?.siteId ?? '',
        siteName: content?.siteName ?? '',
        size: content?.size ?? 0,
        contentType: content?.contentType,
        viewCount: row.viewCount,
        lastViewedAt: row.lastViewedAt,
      }
    })
  }

  private async mostActiveUsers(filter: AnalyticsFilter) {
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: this.activityMatch(filter) },
      { $group: { _id: '$user', viewCount: { $sum: 1 }, lastActive: { $max: '$createdAt' } } },
      { $sort: { viewCount: -1, lastActive: -1 } },
      { $limit: filter.limit },
    ])
    const usersById = await this.usersById(rows.map((row: any) => row._id))
    return rows.map((row: any) => {
      const user = usersById.get(String(row._id))
      return { id: String(row._id), name: user?.displayName ?? user?.email ?? 'Unknown user', viewCount: row.viewCount, lastActive: row.lastActive }
    })
  }

  private async contentActivity(filter: AnalyticsFilter) {
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: this.activityMatch(filter) },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: filter.limit },
    ])
    return rows.map((row: any) => ({ name: humanizeAction(String(row._id)), action: String(row._id), count: row.count, viewCount: row.count }))
  }

  private async monthlyActiveUserCount(filter: AnalyticsFilter) {
    const rows = await this.ctx.models.ActivityModel.aggregate([
      { $match: this.activityMatch({ ...filter, startDate: filter.startDate ?? daysAgoStart(30, filter.timeZone) }) },
      { $group: { _id: '$user' } },
      { $count: 'count' },
    ])
    return rows[0]?.count ?? 0
  }
}
