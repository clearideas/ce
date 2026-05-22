import {
  humanizeAction,
  planActivityNotificationEmails,
  type NotificationActionTypeRegistry,
} from '@clearideas/core'
import type { CoreProviders } from '@clearideas/core/providers'
import { DateTime } from 'luxon'
import { config } from '../config/index.js'

export interface NotificationWorkerContext {
  models: {
    ActivityModel: any
    SiteModel: any
    UserModel: any
  }
  providers: Pick<CoreProviders, 'email'>
  actionToNotificationType?: NotificationActionTypeRegistry
  appBaseUrl?: string
  now?: () => Date
  workerId?: string
  batchSize?: number
  maxAttempts?: number
  claimTtlMs?: number
  retryBaseDelayMs?: number
}

type NotificationDeliveryStatus = 'scheduled' | 'sent' | 'skipped'

interface NotificationDeliveryState {
  userId: string
  status: NotificationDeliveryStatus
  frequency?: string
  scheduledAt?: Date | string
  sentAt?: Date | string
  skippedAt?: Date | string
  reason?: string
}

interface PreparedNotificationActivity {
  activity: any
  deliveries: NotificationDeliveryState[]
  dueNotifications: DueNotification[]
  sentCount: number
  workerId: string
}

interface DueNotification {
  activity: any
  delivery: NotificationDeliveryState
  email: {
    to: string | string[]
    templateAlias: string
    templateModel: Record<string, unknown>
  }
  site: any
  user: any
}

const DIGEST_NOTIFICATIONS_PER_SITE_LIMIT = 10
const DIGEST_SITES_LIMIT = 10

export interface NotificationWorkerHandle {
  stop: () => void
}

export function startNotificationWorker(ctx: NotificationWorkerContext): NotificationWorkerHandle | undefined {
  if (String(process.env.NOTIFICATIONS_ENABLED ?? 'true').toLowerCase() === 'false') return undefined
  const safeIntervalMs = config.notifications.pollIntervalMs()
  let stopped = false
  let running = false

  const run = () => {
    if (stopped || running) return
    running = true
    processPendingNotifications(ctx)
      .catch(error => {
        console.error('[ce-notification-worker] failed', error)
      })
      .finally(() => {
        running = false
      })
  }

  const timer = setInterval(run, safeIntervalMs)
  timer.unref?.()
  run()

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}

export async function processPendingNotifications(ctx: NotificationWorkerContext) {
  const registry = ctx.actionToNotificationType ?? config.notifications.actionTypes
  const batchSize = numberOption(ctx.batchSize, config.notifications.batchSize, { min: 1, max: 500 })
  const workerId = ctx.workerId ?? `ce-notification-worker-${process.pid}`
  const claimed: any[] = []

  for (let index = 0; index < batchSize; index += 1) {
    const activity = await claimNextActivity(ctx, registry, workerId)
    if (!activity) break
    claimed.push(activity)
  }

  const prepared: PreparedNotificationActivity[] = []
  for (const activity of claimed) {
    const result = await prepareActivityNotification(ctx, activity, registry, workerId)
    if (result) prepared.push(result)
  }

  const failedActivities = new Set<string>()
  for (const group of groupDueNotifications(prepared)) {
    try {
      await ctx.providers.email.sendTemplate(createNotificationEmail(group))
      const sentAt = getNow(ctx)
      for (const item of group) {
        item.delivery.status = 'sent'
        item.delivery.sentAt = sentAt
        const preparedActivity = prepared.find(candidate => String(candidate.activity._id) === String(item.activity._id))
        if (preparedActivity) preparedActivity.sentCount += 1
      }
    } catch (error) {
      for (const item of group) {
        const activityId = String(item.activity._id)
        if (failedActivities.has(activityId)) continue
        failedActivities.add(activityId)
        await markFailed(ctx, item.activity, error, workerId)
      }
    }
  }

  for (const item of prepared) {
    if (failedActivities.has(String(item.activity._id))) continue
    await finalizeActivityNotification(ctx, item)
  }
}

async function claimNextActivity(
  ctx: NotificationWorkerContext,
  registry: NotificationActionTypeRegistry,
  workerId: string,
) {
  const now = getNow(ctx)
  const maxAttempts = numberOption(ctx.maxAttempts, config.notifications.maxAttempts, { min: 1, max: 50 })
  const claimTtlMs = numberOption(ctx.claimTtlMs, config.notifications.claimTtlMs, { min: 10_000 })
  const expiredClaimBefore = new Date(now.getTime() - claimTtlMs)

  return ctx.models.ActivityModel.findOneAndUpdate(
    {
      'attributes.notificationProcessedAt': { $exists: false },
      action: { $in: Object.keys(registry) },
      $and: [
        {
          $or: [
            { 'attributes.notificationAttemptCount': { $exists: false } },
            { 'attributes.notificationAttemptCount': { $lt: maxAttempts } },
          ],
        },
        {
          $or: [
            { 'attributes.notificationNextAttemptAt': { $exists: false } },
            { 'attributes.notificationNextAttemptAt': { $lte: now } },
          ],
        },
        {
          $or: [
            { 'attributes.notificationClaimedAt': { $exists: false } },
            { 'attributes.notificationClaimedAt': { $lte: expiredClaimBefore } },
          ],
        },
      ],
    },
    {
      $set: {
        'attributes.notificationClaimedAt': now,
        'attributes.notificationClaimedBy': workerId,
      },
      $unset: {
        'attributes.notificationFailedAt': '',
        'attributes.notificationError': '',
      },
    },
    {
      sort: { createdAt: 1 },
      returnDocument: 'after',
      lean: true,
    },
  )
}

async function prepareActivityNotification(
  ctx: NotificationWorkerContext,
  activity: any,
  registry: NotificationActionTypeRegistry,
  workerId: string,
): Promise<PreparedNotificationActivity | undefined> {
  const notificationType = registry[String(activity.action)]
  if (!notificationType) {
    await markProcessed(ctx, activity, 0, workerId)
    return undefined
  }

  try {
    const siteId = String(activity.parentOnModel === 'Site' ? activity.parent : activity.target)
    const site = await ctx.models.SiteModel.findById(siteId).lean()
    if (!site) {
      await markProcessed(ctx, activity, 0, workerId)
      return undefined
    }

    const members = site.members ?? []
    const memberIds = members
      .map((member: any) => member.user ?? member.userId)
      .filter((id: any) => String(id) !== String(activity.user))
    if (memberIds.length === 0) {
      await markProcessed(ctx, activity, 0, workerId)
      return undefined
    }

    if (site.attributes?.notifications !== true) {
      await markProcessed(ctx, activity, 0, workerId)
      return undefined
    }

    const users = await ctx.models.UserModel.find({ _id: { $in: memberIds } }).lean()
    const deliveries = planNotificationDeliveries(ctx, activity, site, users, members, registry)
    let sentCount = Number(activity.attributes?.notificationSentCount ?? 0)
    const dueNotifications: DueNotification[] = []

    for (const delivery of deliveries) {
      if (delivery.status !== 'scheduled') continue
      const user = users.find((candidate: any) => String(candidate._id) === delivery.userId)
      if (!user) {
        delivery.status = 'skipped'
        delivery.reason = 'user-not-found'
        delivery.skippedAt = getNow(ctx)
        continue
      }
      if (!isNotificationDue(user, getNow(ctx))) continue

      const [email] = planActivityNotificationEmails({
        activity,
        site,
        users: [user],
        appBaseUrl: ctx.appBaseUrl ?? getAppBaseUrl(),
        actionToNotificationType: registry,
      })
      if (!email) {
        delivery.status = 'skipped'
        delivery.reason = 'not-subscribed'
        delivery.skippedAt = getNow(ctx)
        continue
      }

      dueNotifications.push({ activity, delivery, email, site, user })
    }

    return { activity, deliveries, dueNotifications, sentCount, workerId }
  } catch (error) {
    await markFailed(ctx, activity, error, workerId)
    return undefined
  }
}

async function finalizeActivityNotification(
  ctx: NotificationWorkerContext,
  prepared: PreparedNotificationActivity,
) {
  const { activity, deliveries, sentCount, workerId } = prepared
  const hasScheduledDeliveries = deliveries.some(delivery => delivery.status === 'scheduled')
  if (hasScheduledDeliveries) {
    await markDeferred(ctx, activity, deliveries, sentCount, workerId)
    return
  }

  await markProcessed(ctx, activity, sentCount, workerId, deliveries)
}

function planNotificationDeliveries(
  ctx: NotificationWorkerContext,
  activity: any,
  site: any,
  users: any[],
  members: any[],
  registry: NotificationActionTypeRegistry,
): NotificationDeliveryState[] {
  const existing = new Map<string, NotificationDeliveryState>(
    (activity.attributes?.notificationDeliveries ?? [])
      .filter((delivery: any) => delivery?.userId)
      .map((delivery: NotificationDeliveryState) => [String(delivery.userId), { ...delivery, userId: String(delivery.userId) }]),
  )
  const planned: NotificationDeliveryState[] = []
  const now = getNow(ctx)

  for (const user of users) {
    const userId = String(user._id)
    const member = members.find((candidate: any) => String(candidate.user ?? candidate.userId) === userId)
    const current = existing.get(userId)
    if (current?.status === 'sent' || current?.status === 'skipped') {
      planned.push(current)
      continue
    }

    const frequency = String(user.attributes?.notifications?.frequency ?? 'daily')
    if (frequency === 'never') {
      planned.push({
        userId,
        status: 'skipped',
        frequency,
        reason: 'frequency-never',
        skippedAt: now,
      })
      continue
    }

    if (isSiteSuppressed(user, site)) {
      planned.push({
        userId,
        status: 'skipped',
        frequency,
        reason: 'site-suppressed',
        skippedAt: now,
      })
      continue
    }

    const membershipStatus = getNotificationMembershipStatus(user, member)
    if (membershipStatus !== 'accepted') {
      planned.push({
        userId,
        status: 'skipped',
        frequency,
        reason: membershipStatus,
        skippedAt: now,
      })
      continue
    }

    const notificationType = registry[String(activity.action)]
    if (!isSubscribedToNotification(user, notificationType)) {
      planned.push({
        userId,
        status: 'skipped',
        frequency,
        reason: 'not-subscribed',
        skippedAt: now,
      })
      continue
    }

    const [email] = planActivityNotificationEmails({
      activity,
      site,
      users: [user],
      appBaseUrl: ctx.appBaseUrl ?? getAppBaseUrl(),
      actionToNotificationType: registry,
    })

    if (!email) {
      planned.push({
        userId,
        status: 'skipped',
        frequency,
        reason: 'not-subscribed',
        skippedAt: now,
      })
      continue
    }

    planned.push({
      userId,
      status: 'scheduled',
      frequency,
      scheduledAt: current?.scheduledAt ?? now,
    })
  }

  return planned
}

function isSiteSuppressed(user: any, site: any): boolean {
  const suppressedSites = user.attributes?.sites?.suppressNotifications ?? []
  const siteId = String(site._id ?? site.id)
  return Array.isArray(suppressedSites) && suppressedSites.map(String).includes(siteId)
}

function isSubscribedToNotification(user: any, notificationType: string | undefined): boolean {
  if (!notificationType) return false
  const notifications = user.attributes?.notifications ?? {}
  const subscribedAdminActions = Array.isArray(notifications.subscribedAdminActions)
    ? notifications.subscribedAdminActions
    : []
  const subscribedActions = Array.isArray(notifications.subscribedActions)
    ? notifications.subscribedActions
    : []
  return subscribedAdminActions.includes(notificationType) || subscribedActions.includes(notificationType)
}

function getNotificationMembershipStatus(user: any, member: any): 'accepted' | 'site-invite-pending' | 'site-invite-declined' {
  if (!member) return 'site-invite-pending'
  if (member.declinedAt != null) return 'site-invite-declined'
  if (member.acceptedAt != null) return 'accepted'
  if (String(member.role ?? '') === 'owner') return 'accepted'
  return user.attributes?.sites?.autoAcceptInvites !== false
    ? 'accepted'
    : 'site-invite-pending'
}

function groupDueNotifications(prepared: PreparedNotificationActivity[]): DueNotification[][] {
  const groups = new Map<string, DueNotification[]>()
  for (const item of prepared) {
    for (const dueNotification of item.dueNotifications) {
      const key = String(dueNotification.user._id)
      const group = groups.get(key) ?? []
      group.push(dueNotification)
      groups.set(key, group)
    }
  }
  return [...groups.values()]
}

function createNotificationEmail(group: DueNotification[]) {
  if (group.length === 1) return group[0].email

  const first = group[0]
  const siteGroups = groupDigestNotificationsBySite(group)
  return {
    to: first.email.to,
    templateAlias: 'activity-notification-digest',
    templateModel: {
      name: first.user.displayName || first.user.email,
      notification_count: group.length,
      action_url: first.email.templateModel.action_url,
      sites: siteGroups.slice(0, DIGEST_SITES_LIMIT),
      hidden_site_count: Math.max(0, siteGroups.length - DIGEST_SITES_LIMIT),
      has_hidden_sites: siteGroups.length > DIGEST_SITES_LIMIT,
    },
  }
}

function groupDigestNotificationsBySite(group: DueNotification[]) {
  const siteGroups = new Map<string, DueNotification[]>()
  for (const item of group) {
    const siteId = String(item.site._id ?? item.site.id)
    const siteGroup = siteGroups.get(siteId) ?? []
    siteGroup.push(item)
    siteGroups.set(siteId, siteGroup)
  }

  return [...siteGroups.values()].map(siteGroup => {
    const first = siteGroup[0]
    const visible = siteGroup.slice(0, DIGEST_NOTIFICATIONS_PER_SITE_LIMIT)
    const hiddenCount = Math.max(0, siteGroup.length - visible.length)
    return {
      site_name: first.site.name,
      site_notification_count: siteGroup.length,
      hidden_count: hiddenCount,
      has_hidden: hiddenCount > 0,
      action_url: first.email.templateModel.action_url,
      notifications: visible.map(item => ({
        action: humanizeAction(String(item.activity.action)),
        item_name: item.activity.attributes?.fileName || item.activity.attributes?.name || 'content',
      })),
    }
  })
}

async function markDeferred(
  ctx: NotificationWorkerContext,
  activity: any,
  deliveries: NotificationDeliveryState[],
  sentCount: number,
  workerId: string,
) {
  await ctx.models.ActivityModel.updateOne(
    {
      _id: activity._id,
      'attributes.notificationClaimedBy': workerId,
      'attributes.notificationProcessedAt': { $exists: false },
    },
    {
      $set: {
        'attributes.notificationDeliveries': deliveries,
        'attributes.notificationSentCount': sentCount,
      },
      $unset: {
        'attributes.notificationClaimedAt': '',
        'attributes.notificationClaimedBy': '',
        'attributes.notificationFailedAt': '',
        'attributes.notificationError': '',
        'attributes.notificationNextAttemptAt': '',
      },
    },
  )
}

async function markProcessed(
  ctx: NotificationWorkerContext,
  activity: any,
  sentCount: number,
  workerId: string,
  deliveries?: NotificationDeliveryState[],
) {
  const now = getNow(ctx)
  await ctx.models.ActivityModel.updateOne(
    {
      _id: activity._id,
      'attributes.notificationClaimedBy': workerId,
      'attributes.notificationProcessedAt': { $exists: false },
    },
    {
      $set: {
        'attributes.notificationProcessedAt': now,
        'attributes.notificationSentCount': sentCount,
        ...(deliveries ? { 'attributes.notificationDeliveries': deliveries } : {}),
      },
      $unset: {
        'attributes.notificationClaimedAt': '',
        'attributes.notificationClaimedBy': '',
        'attributes.notificationFailedAt': '',
        'attributes.notificationError': '',
        'attributes.notificationNextAttemptAt': '',
      },
    },
  )
}

function isNotificationDue(user: any, nowDate: Date): boolean {
  const notifications = user.attributes?.notifications ?? {}
  const frequency = String(notifications.frequency ?? 'daily')
  if (frequency === 'never') return false

  const zone = user.attributes?.timeZone || 'utc'
  const now = DateTime.fromJSDate(nowDate).setZone(zone)
  if (!now.isValid) return false

  const days = Array.isArray(notifications.days) ? notifications.days.map(String) : []
  if (days.length > 0 && !days.includes(now.toFormat('cccc'))) return false

  const hours = Array.isArray(notifications.hours) ? notifications.hours : ['09:00', '17:00']
  const start = timeOnDate(now, String(hours[0] ?? '09:00'))
  if (!start) return false

  if (frequency === 'daily' || frequency === 'weekly') {
    return now >= start && now < start.plus({ hours: 1 })
  }

  if (frequency === 'hourly') {
    const end = timeOnDate(now, String(hours[1] ?? '17:00'))
    return Boolean(end && isWithinWindow(now, start, end) && now.minute === 0)
  }

  if (frequency === 'immediate') {
    const end = timeOnDate(now, String(hours[1] ?? '17:00'))
    return Boolean(end && isWithinWindow(now, start, end))
  }

  return false
}

function timeOnDate(now: DateTime, value: string): DateTime | undefined {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined
  return now.set({ hour, minute, second: 0, millisecond: 0 })
}

function isWithinWindow(now: DateTime, start: DateTime, end: DateTime): boolean {
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

async function markFailed(ctx: NotificationWorkerContext, activity: any, error: unknown, workerId: string) {
  const now = getNow(ctx)
  const attemptCount = Number(activity.attributes?.notificationAttemptCount ?? 0) + 1
  const maxAttempts = numberOption(ctx.maxAttempts, config.notifications.maxAttempts, { min: 1, max: 50 })
  const nextAttemptAt = attemptCount >= maxAttempts
    ? undefined
    : new Date(now.getTime() + retryDelayMs(ctx, attemptCount))

  await ctx.models.ActivityModel.updateOne(
    {
      _id: activity._id,
      'attributes.notificationClaimedBy': workerId,
      'attributes.notificationProcessedAt': { $exists: false },
    },
    {
      $set: {
        'attributes.notificationFailedAt': now,
        'attributes.notificationError': formatError(error),
        'attributes.notificationAttemptCount': attemptCount,
        ...(nextAttemptAt ? { 'attributes.notificationNextAttemptAt': nextAttemptAt } : {}),
      },
      $unset: {
        'attributes.notificationClaimedAt': '',
        'attributes.notificationClaimedBy': '',
        ...(nextAttemptAt ? {} : { 'attributes.notificationNextAttemptAt': '' }),
      },
    },
  )
}

function retryDelayMs(ctx: NotificationWorkerContext, attemptCount: number): number {
  const baseDelayMs = numberOption(ctx.retryBaseDelayMs, config.notifications.retryBaseDelayMs, { min: 1_000 })
  const exponent = Math.min(attemptCount - 1, 6)
  return baseDelayMs * 2 ** exponent
}

function numberOption(value: unknown, fallback: number, options: { min?: number; max?: number } = {}): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const min = options.min ?? parsed
  const max = options.max ?? parsed
  return Math.max(min, Math.min(max, parsed))
}

function getNow(ctx: NotificationWorkerContext): Date {
  return ctx.now?.() ?? new Date()
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 1000)
}

function getAppBaseUrl(): string {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 4100}`
}
