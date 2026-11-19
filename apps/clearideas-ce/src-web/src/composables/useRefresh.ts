import { useContentStore, useProfileStore, useSiteStore, useUserStore } from '../stores'

async function ignoreOffline(action: () => Promise<void>) {
  try {
    await action()
  } catch (error) {
    const offline = Boolean(error && typeof error === 'object' && (error as { offline?: unknown }).offline)
    if (!offline) throw error
  }
}

export function useRefresh() {
  const contentStore = useContentStore()
  const profileStore = useProfileStore()
  const siteStore = useSiteStore()
  const userStore = useUserStore()

  const contentRefresh = async (
    siteId: string,
    id?: string,
    _latest = false,
    contentType: 'file' | 'folder' = 'folder',
  ) => {
    await ignoreOffline(async () => {
      if (contentType === 'file' && id) {
        await contentStore.getFile(siteId, id)
        return
      }
      await siteStore.getSites()
      await siteStore.setCurrentSite(siteId)
      contentStore.activeFolderId = id
    })
  }

  const sitesRefresh = async () => {
    await ignoreOffline(async () => {
      await Promise.all([siteStore.getSites(), profileStore.getProfile()])
    })
  }

  const usersRefresh = async (siteId?: string) => {
    await ignoreOffline(async () => {
      await siteStore.getSites()
      if (siteId) await userStore.getSiteUsers(siteId)
      else await userStore.getUsers()
    })
  }

  return { contentRefresh, sitesRefresh, usersRefresh }
}
