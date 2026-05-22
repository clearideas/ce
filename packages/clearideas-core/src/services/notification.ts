import { buildAppUrl } from './app-url.js'
import { humanizeAction } from './analytics.js'

export type NotificationActionTypeRegistry = Record<string, string>

export interface PlannedNotificationEmail {
  to: string
  templateAlias: string
  templateModel: Record<string, unknown>
}

export function shouldNotifyUserForActivity(input: {
  user: any
  site: any
  notificationType: string
}): boolean {
  const suppressedSites = input.user.attributes?.sites?.suppressNotifications ?? []
  if (suppressedSites.map(String).includes(String(input.site._id ?? input.site.id))) return false
  const subscribedAdminActions = input.user.attributes?.notifications?.subscribedAdminActions ?? []
  const subscribedActions = input.user.attributes?.notifications?.subscribedActions ?? []
  return subscribedAdminActions.includes(input.notificationType) || subscribedActions.includes(input.notificationType)
}

export function planActivityNotificationEmails(input: {
  activity: any
  site: any
  users: any[]
  appBaseUrl: string
  actionToNotificationType: NotificationActionTypeRegistry
  templateAlias?: string
}): PlannedNotificationEmail[] {
  const notificationType = input.actionToNotificationType[String(input.activity.action)]
  if (!notificationType) return []
  const siteId = String(input.site._id ?? input.site.id)
  return input.users
    .filter(user => shouldNotifyUserForActivity({ user, site: input.site, notificationType }))
    .map(user => ({
      to: user.email,
      templateAlias: input.templateAlias ?? 'activity-notification',
      templateModel: {
        name: user.displayName || user.email,
        action: humanizeAction(String(input.activity.action)),
        site_name: input.site.name,
        item_name: input.activity.attributes?.fileName || input.activity.attributes?.name || 'content',
        action_url: buildAppUrl({ baseUrl: input.appBaseUrl, path: `/site/${siteId}` }),
      },
    }))
}
