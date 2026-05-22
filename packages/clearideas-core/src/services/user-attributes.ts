import { coreNotificationAction } from './config.js'

export function createDefaultUserAttributes() {
  return {
    notifications: {
      frequency: 'daily',
      hours: ['09:00', '17:00'],
      days: [],
      subscribedActions: [coreNotificationAction.uploaded],
      subscribedAdminActions: [coreNotificationAction.uploaded, coreNotificationAction.created, coreNotificationAction.deleted],
    },
    sites: {
      autoAcceptInvites: true,
      favourites: [],
      suppressedSites: [],
      suppressNotifications: [],
    },
  }
}
