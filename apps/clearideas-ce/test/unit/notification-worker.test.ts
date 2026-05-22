import { describe, expect, it, vi } from 'vitest'
import {
  processPendingNotifications,
  startNotificationWorker,
} from '../../src/workers/notification-worker.js'

describe('CE notification worker', () => {
  it('claims pending activities, sends subscribed notifications, and marks them processed', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
    })
    const sent: any[] = []

    await processPendingNotifications({
      models,
      providers: {
        email: {
          async send() {},
          async sendTemplate(input) {
            sent.push(input)
          },
        },
      },
      now: () => now,
      workerId: 'worker-a',
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: 'member@clearideas.local',
      templateAlias: 'activity-notification',
      templateModel: {
        action: 'File Uploaded',
        site_name: 'Test Site',
        item_name: 'report.pdf',
      },
    })
    expect(activity.attributes.notificationProcessedAt).toEqual(now)
    expect(activity.attributes.notificationSentCount).toBe(1)
    expect(activity.attributes.notificationDeliveries).toMatchObject([
      { userId: 'member-id', status: 'sent', frequency: 'immediate' },
      { userId: 'muted-id', status: 'skipped', reason: 'site-suppressed' },
    ])
    expect(activity.attributes.notificationClaimedAt).toBeUndefined()
    expect(activity.attributes.notificationClaimedBy).toBeUndefined()
  })

  it('defers daily notifications until the configured send window', async () => {
    const beforeWindow = new Date('2026-05-19T08:30:00Z')
    const inWindow = new Date('2026-05-19T09:05:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: {
        frequency: 'daily',
        hours: ['09:00', '17:00'],
        days: [],
        subscribedActions: ['uploaded'],
      },
    })
    const sendTemplate = vi.fn()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => beforeWindow,
      workerId: 'worker-a',
    })

    expect(sendTemplate).not.toHaveBeenCalled()
    expect(activity.attributes.notificationProcessedAt).toBeUndefined()
    expect(activity.attributes.notificationDeliveries).toMatchObject([
      { userId: 'member-id', status: 'scheduled', frequency: 'daily' },
      { userId: 'muted-id', status: 'skipped', reason: 'site-suppressed' },
    ])
    expect(activity.attributes.notificationClaimedAt).toBeUndefined()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => inWindow,
      workerId: 'worker-a',
    })

    expect(sendTemplate).toHaveBeenCalledTimes(1)
    expect(activity.attributes.notificationProcessedAt).toEqual(inWindow)
    expect(activity.attributes.notificationSentCount).toBe(1)
    expect(activity.attributes.notificationDeliveries).toMatchObject([
      { userId: 'member-id', status: 'sent', frequency: 'daily' },
      { userId: 'muted-id', status: 'skipped', reason: 'site-suppressed' },
    ])
  })

  it('skips users who have suppressed the site', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: { subscribedActions: [] },
    })
    const sendTemplate = vi.fn()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => now,
      workerId: 'worker-a',
    })

    expect(sendTemplate).not.toHaveBeenCalled()
    expect(activity.attributes.notificationDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'muted-id', status: 'skipped', reason: 'site-suppressed' }),
    ]))
  })

  it('skips pending site invitees who do not auto-accept invites', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
      extraMembers: [{ user: 'pending-id', role: 'viewer', acceptedAt: null, declinedAt: null }],
      extraUsers: [{
        _id: 'pending-id',
        email: 'pending@clearideas.local',
        displayName: 'Pending User',
        attributes: {
          notifications: {
            frequency: 'immediate',
            hours: ['09:00', '17:00'],
            days: ['Tuesday'],
            subscribedActions: ['uploaded'],
          },
          sites: { autoAcceptInvites: false },
        },
      }],
    })
    const sendTemplate = vi.fn()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => now,
      workerId: 'worker-a',
    })

    expect(sendTemplate).toHaveBeenCalledTimes(1)
    expect(activity.attributes.notificationDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'pending-id', status: 'skipped', reason: 'site-invite-pending' }),
    ]))
  })

  it('applies the recipient eligibility matrix before sending', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const acceptedAt = new Date('2026-05-19T10:00:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: {
        frequency: 'never',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
      extraMembers: [
        { user: 'unsubscribed-id', role: 'viewer', acceptedAt },
        { user: 'pending-id', role: 'viewer', acceptedAt: null, declinedAt: null },
        { user: 'declined-id', role: 'viewer', acceptedAt: null, declinedAt: new Date('2026-05-19T11:00:00Z') },
        { user: 'accepted-no-auto-id', role: 'viewer', acceptedAt },
      ],
      extraUsers: [
        {
          _id: 'unsubscribed-id',
          email: 'unsubscribed@clearideas.local',
          displayName: 'Unsubscribed User',
          attributes: {
            notifications: {
              frequency: 'immediate',
              hours: ['09:00', '17:00'],
              days: ['Tuesday'],
              subscribedActions: ['deleted'],
            },
          },
        },
        {
          _id: 'pending-id',
          email: 'pending@clearideas.local',
          displayName: 'Pending User',
          attributes: {
            notifications: {
              frequency: 'immediate',
              hours: ['09:00', '17:00'],
              days: ['Tuesday'],
              subscribedActions: ['uploaded'],
            },
            sites: { autoAcceptInvites: false },
          },
        },
        {
          _id: 'declined-id',
          email: 'declined@clearideas.local',
          displayName: 'Declined User',
          attributes: {
            notifications: {
              frequency: 'immediate',
              hours: ['09:00', '17:00'],
              days: ['Tuesday'],
              subscribedActions: ['uploaded'],
            },
          },
        },
        {
          _id: 'accepted-no-auto-id',
          email: 'accepted@clearideas.local',
          displayName: 'Accepted User',
          attributes: {
            notifications: {
              frequency: 'immediate',
              hours: ['09:00', '17:00'],
              days: ['Tuesday'],
              subscribedActions: ['uploaded'],
            },
            sites: { autoAcceptInvites: false },
          },
        },
      ],
    })
    const sent: any[] = []

    await processPendingNotifications({
      models,
      providers: {
        email: {
          async send() {},
          async sendTemplate(input) {
            sent.push(input)
          },
        },
      },
      now: () => now,
      workerId: 'worker-a',
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'accepted@clearideas.local' })
    expect(activity.attributes.notificationDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'member-id', status: 'skipped', reason: 'frequency-never' }),
      expect.objectContaining({ userId: 'muted-id', status: 'skipped', reason: 'site-suppressed' }),
      expect.objectContaining({ userId: 'unsubscribed-id', status: 'skipped', reason: 'not-subscribed' }),
      expect.objectContaining({ userId: 'pending-id', status: 'skipped', reason: 'site-invite-pending' }),
      expect.objectContaining({ userId: 'declined-id', status: 'skipped', reason: 'site-invite-declined' }),
      expect.objectContaining({ userId: 'accepted-no-auto-id', status: 'sent' }),
    ]))
    expect(activity.attributes.notificationProcessedAt).toEqual(now)
    expect(activity.attributes.notificationSentCount).toBe(1)
  })

  it('defers hourly notifications until the next top-of-hour poll within the user window', async () => {
    const beforeHour = new Date('2026-05-19T12:30:00Z')
    const topOfHour = new Date('2026-05-19T13:00:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: {
        frequency: 'hourly',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
    })
    const sendTemplate = vi.fn()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => beforeHour,
      workerId: 'worker-a',
    })

    expect(sendTemplate).not.toHaveBeenCalled()
    expect(activity.attributes.notificationProcessedAt).toBeUndefined()
    expect(activity.attributes.notificationDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'member-id', status: 'scheduled', frequency: 'hourly' }),
    ]))

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => topOfHour,
      workerId: 'worker-a',
    })

    expect(sendTemplate).toHaveBeenCalledTimes(1)
    expect(activity.attributes.notificationProcessedAt).toEqual(topOfHour)
    expect(activity.attributes.notificationDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'member-id', status: 'sent', frequency: 'hourly' }),
    ]))
  })

  it('pools multiple due notifications for a user into one digest email', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const firstActivity = createActivity({ id: 'activity-1', action: 'file-uploaded', fileName: 'report.pdf' })
    const secondActivity = createActivity({ id: 'activity-2', action: 'folder-created', fileName: 'Financials' })
    const models = createNotificationModels({
      activities: [firstActivity, secondActivity],
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded', 'created'],
      },
    })
    const sent: any[] = []

    await processPendingNotifications({
      models,
      providers: {
        email: {
          async send() {},
          async sendTemplate(input) {
            sent.push(input)
          },
        },
      },
      now: () => now,
      workerId: 'worker-a',
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: 'member@clearideas.local',
      templateAlias: 'activity-notification-digest',
      templateModel: {
        notification_count: 2,
        sites: [
          expect.objectContaining({
            site_name: 'Test Site',
            notifications: [
              expect.objectContaining({ action: 'File Uploaded', item_name: 'report.pdf' }),
              expect.objectContaining({ action: 'Folder Created', item_name: 'Financials' }),
            ],
          }),
        ],
      },
    })
    expect(firstActivity.attributes.notificationProcessedAt).toEqual(now)
    expect(secondActivity.attributes.notificationProcessedAt).toEqual(now)
    expect(firstActivity.attributes.notificationSentCount).toBe(1)
    expect(secondActivity.attributes.notificationSentCount).toBe(1)
  })

  it('limits digest notifications per site and reports omitted updates', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const activities = Array.from({ length: 12 }, (_, index) =>
      createActivity({
        id: `activity-${index + 1}`,
        action: 'file-uploaded',
        fileName: `report-${index + 1}.pdf`,
      }),
    )
    const models = createNotificationModels({
      activities,
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
      batchSize: 20,
    })
    const sent: any[] = []

    await processPendingNotifications({
      models,
      providers: {
        email: {
          async send() {},
          async sendTemplate(input) {
            sent.push(input)
          },
        },
      },
      now: () => now,
      workerId: 'worker-a',
      batchSize: 20,
    })

    expect(sent).toHaveLength(1)
    expect(sent[0].templateModel.notification_count).toBe(12)
    expect(sent[0].templateModel.sites).toHaveLength(1)
    expect(sent[0].templateModel.sites[0]).toMatchObject({
      site_name: 'Test Site',
      site_notification_count: 12,
      hidden_count: 2,
      has_hidden: true,
    })
    expect(sent[0].templateModel.sites[0].notifications).toHaveLength(10)
  })

  it('limits digest sites and reports omitted sites', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const sites = Array.from({ length: 12 }, (_, index) => ({
      _id: `site-${index + 1}`,
      name: `Site ${index + 1}`,
    }))
    const activities = sites.map((site, index) =>
      createActivity({
        id: `site-activity-${index + 1}`,
        siteId: site._id,
        action: 'file-uploaded',
        fileName: `site-${index + 1}.pdf`,
      }),
    )
    const models = createNotificationModels({
      activities,
      sites,
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
    })
    const sent: any[] = []

    await processPendingNotifications({
      models,
      providers: {
        email: {
          async send() {},
          async sendTemplate(input) {
            sent.push(input)
          },
        },
      },
      now: () => now,
      workerId: 'worker-a',
      batchSize: 20,
    })

    expect(sent).toHaveLength(1)
    expect(sent[0].templateModel.notification_count).toBe(12)
    expect(sent[0].templateModel.sites).toHaveLength(10)
    expect(sent[0].templateModel).toMatchObject({
      hidden_site_count: 2,
      has_hidden_sites: true,
    })
  })

  it('does not send notifications when the site notification toggle is disabled', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      siteNotificationsEnabled: false,
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
    })
    const sendTemplate = vi.fn()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => now,
      workerId: 'worker-a',
    })

    expect(sendTemplate).not.toHaveBeenCalled()
    expect(activity.attributes.notificationProcessedAt).toEqual(now)
    expect(activity.attributes.notificationSentCount).toBe(0)
  })

  it('records failed sends with backoff and retries later', async () => {
    const firstRun = new Date('2026-05-19T12:00:00Z')
    const retryRun = new Date('2026-05-19T12:01:01Z')
    const activity = createActivity({ action: 'file-uploaded' })
    const models = createNotificationModels({
      activities: [activity],
      memberNotifications: {
        frequency: 'immediate',
        hours: ['09:00', '17:00'],
        days: ['Tuesday'],
        subscribedActions: ['uploaded'],
      },
    })
    const sendTemplate = vi.fn()
      .mockRejectedValueOnce(new Error('SMTP unavailable'))
      .mockResolvedValueOnce(undefined)

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => firstRun,
      workerId: 'worker-a',
      retryBaseDelayMs: 60_000,
    })

    expect(activity.attributes.notificationProcessedAt).toBeUndefined()
    expect(activity.attributes.notificationAttemptCount).toBe(1)
    expect(activity.attributes.notificationFailedAt).toEqual(firstRun)
    expect(activity.attributes.notificationError).toContain('SMTP unavailable')
    expect(activity.attributes.notificationNextAttemptAt).toEqual(new Date('2026-05-19T12:01:00Z'))
    expect(activity.attributes.notificationClaimedAt).toBeUndefined()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => retryRun,
      workerId: 'worker-a',
      retryBaseDelayMs: 60_000,
    })

    expect(sendTemplate).toHaveBeenCalledTimes(2)
    expect(activity.attributes.notificationProcessedAt).toEqual(retryRun)
    expect(activity.attributes.notificationSentCount).toBe(1)
    expect(activity.attributes.notificationFailedAt).toBeUndefined()
    expect(activity.attributes.notificationError).toBeUndefined()
    expect(activity.attributes.notificationNextAttemptAt).toBeUndefined()
  })

  it('does not claim activities that are already claimed by a live worker', async () => {
    const now = new Date('2026-05-19T12:00:00Z')
    const activity = createActivity({
      action: 'file-uploaded',
      attributes: {
        notificationClaimedAt: new Date('2026-05-19T11:59:30Z'),
        notificationClaimedBy: 'worker-a',
      },
    })
    const models = createNotificationModels({ activities: [activity] })
    const sendTemplate = vi.fn()

    await processPendingNotifications({
      models,
      providers: { email: { async send() {}, sendTemplate } },
      now: () => now,
      workerId: 'worker-b',
      claimTtlMs: 60_000,
    })

    expect(sendTemplate).not.toHaveBeenCalled()
    expect(activity.attributes.notificationClaimedBy).toBe('worker-a')
    expect(activity.attributes.notificationProcessedAt).toBeUndefined()
  })

  it('returns a stoppable worker handle', () => {
    vi.useFakeTimers()
    try {
      const handle = startNotificationWorker({
        models: createNotificationModels({ activities: [] }),
        providers: { email: { async send() {}, async sendTemplate() {} } },
      })
      expect(handle).toBeDefined()
      expect(() => handle?.stop()).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})

function createActivity(input: { action: string; attributes?: Record<string, unknown>; id?: string; fileName?: string; siteId?: string }) {
  const siteId = input.siteId ?? 'site-id'
  return {
    _id: input.id ?? `activity-${Math.random()}`,
    user: 'owner-id',
    action: input.action,
    target: siteId,
    onModel: 'Site',
    attributes: {
      fileName: input.fileName ?? 'report.pdf',
      ...(input.attributes ?? {}),
    },
    createdAt: new Date('2026-05-19T11:00:00Z'),
  }
}

function createNotificationModels(input: {
  activities: any[]
  siteNotificationsEnabled?: boolean
  memberNotifications?: Record<string, unknown>
  extraMembers?: any[]
  extraUsers?: any[]
  sites?: Array<{ _id: string; name: string; attributes?: Record<string, unknown>; members?: any[] }>
  batchSize?: number
}) {
  const defaultMembers = [
    { user: 'owner-id', role: 'owner' },
    { user: 'member-id', role: 'viewer' },
    { user: 'muted-id', role: 'viewer' },
    ...(input.extraMembers ?? []),
  ]
  const site = {
    _id: 'site-id',
    name: 'Test Site',
    attributes: { notifications: input.siteNotificationsEnabled ?? true },
    members: defaultMembers,
  }
  const sites = input.sites?.map(candidate => ({
    ...candidate,
    attributes: { notifications: input.siteNotificationsEnabled ?? true, ...(candidate.attributes ?? {}) },
    members: candidate.members ?? defaultMembers,
  })) ?? [site]
  const suppressedSiteIds = sites.map(candidate => String(candidate._id))
  const users = [
    {
      _id: 'member-id',
      email: 'member@clearideas.local',
      displayName: 'Member User',
      attributes: { notifications: input.memberNotifications ?? { subscribedActions: ['uploaded'] } },
    },
    {
      _id: 'muted-id',
      email: 'muted@clearideas.local',
      displayName: 'Muted User',
      attributes: {
        notifications: { subscribedActions: ['uploaded'] },
        sites: { suppressNotifications: suppressedSiteIds },
      },
    },
    ...(input.extraUsers ?? []),
  ]

  return {
    ActivityModel: {
      async findOneAndUpdate(query: any, update: any) {
        const activity = input.activities.find(item => isClaimable(item, query))
        if (!activity) return null
        applyUpdate(activity, update)
        return clone(activity)
      },
      async updateOne(query: any, update: any) {
        const activity = input.activities.find(item => String(item._id) === String(query._id))
        if (!activity) return { modifiedCount: 0 }
        if (query['attributes.notificationClaimedBy'] && activity.attributes.notificationClaimedBy !== query['attributes.notificationClaimedBy']) {
          return { modifiedCount: 0 }
        }
        applyUpdate(activity, update)
        return { modifiedCount: 1 }
      },
    },
    SiteModel: {
      findById(siteId: string) {
        return {
          lean: async () => sites.find(candidate => String(candidate._id) === String(siteId)) ?? null,
        }
      },
    },
    UserModel: {
      find(query: any) {
        const ids = new Set((query._id?.$in ?? []).map(String))
        return {
          lean: async () => users.filter(user => ids.has(String(user._id))),
        }
      },
    },
  } as any
}

function isClaimable(activity: any, query: any) {
  if (activity.attributes.notificationProcessedAt) return false
  if (!query.action.$in.includes(activity.action)) return false
  const attemptCount = Number(activity.attributes.notificationAttemptCount ?? 0)
  const maxAttempts = query.$and[0].$or[1]['attributes.notificationAttemptCount'].$lt
  if (attemptCount >= maxAttempts) return false
  const nextAttemptAt = activity.attributes.notificationNextAttemptAt
  const nextAttemptBefore = query.$and[1].$or[1]['attributes.notificationNextAttemptAt'].$lte
  if (nextAttemptAt && nextAttemptAt > nextAttemptBefore) return false
  const claimedAt = activity.attributes.notificationClaimedAt
  const expiredClaimBefore = query.$and[2].$or[1]['attributes.notificationClaimedAt'].$lte
  if (claimedAt && claimedAt > expiredClaimBefore) return false
  return true
}

function applyUpdate(target: any, update: any) {
  for (const [path, value] of Object.entries(update.$set ?? {})) {
    setPath(target, path, value)
  }
  for (const path of Object.keys(update.$unset ?? {})) {
    unsetPath(target, path)
  }
}

function setPath(target: any, path: string, value: unknown) {
  const parts = path.split('.')
  let cursor = target
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {}
    cursor = cursor[part]
  }
  cursor[parts[parts.length - 1]] = value
}

function unsetPath(target: any, path: string) {
  const parts = path.split('.')
  let cursor = target
  for (const part of parts.slice(0, -1)) {
    cursor = cursor?.[part]
  }
  if (cursor) delete cursor[parts[parts.length - 1]]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
