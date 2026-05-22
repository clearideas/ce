import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ceApi } from '../api/client'
import { useAlert } from '../composables/useAlert'
import type { Site } from '../types/domain'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function mergeSiteMedia(existing: Site | undefined, incoming: Site): Site {
  const existingMedia = existing?.attributes?.media
  const incomingMedia = incoming.attributes?.media
  const mergedMedia = incomingMedia === undefined
    ? existingMedia
    : incomingMedia === null
      ? {}
      : Object.entries(incomingMedia).reduce<Record<string, unknown>>((media, [key, value]) => {
        if (value == null) {
          delete media[key]
          return media
        }
        media[key] = {
          ...(isRecord(value) ? value : {}),
        }
        return media
      }, {})

  return {
    ...existing,
    ...incoming,
    attributes: {
      ...(existing?.attributes ?? {}),
      ...(incoming.attributes ?? {}),
      ...(mergedMedia == null ? {} : { media: mergedMedia }),
    },
  }
}

export const useSiteStore = defineStore('site', () => {
  const sites = ref<Site[]>([])
  const siteDetails = ref<Record<string, Site>>({})
  const currentSiteId = ref<string | undefined>()
  const activeTab = ref<'all' | 'favourites' | 'owned'>('all')
  const loadingSites = ref(false)
  const loadingSuppressedSites = ref(false)
  const suppressedSites = ref<Site[]>([])
  const alert = useAlert()
  const currentSite = computed(() => {
    if (!currentSiteId.value) return null
    const siteSummary = sites.value.find(site => site.id === currentSiteId.value)
    const siteDetail = siteDetails.value[currentSiteId.value]
    if (siteDetail && siteSummary) return mergeSiteMedia(siteSummary, siteDetail)
    return siteDetail ?? siteSummary ?? null
  })
  const sitesWithAttributes = computed(() => sites.value)
  const ownedSitesWithAttributes = computed(() => sites.value.filter(site => site.owned === true))

  async function getSites() {
    loadingSites.value = true
    try {
      sites.value = (await ceApi.sites()).sites
      return sites.value
    } finally {
      loadingSites.value = false
    }
  }

  async function getSitesIfRequired() {
    if (sites.value.length === 0) return getSites()
    return sites.value
  }

  async function getSuppressedSites() {
    loadingSuppressedSites.value = true
    try {
      suppressedSites.value = (await ceApi.suppressedSites()).sites
      return suppressedSites.value
    } finally {
      loadingSuppressedSites.value = false
    }
  }

  async function getSuppressedSitesIfRequired() {
    if (suppressedSites.value.length === 0) return getSuppressedSites()
    return suppressedSites.value
  }

  async function setCurrentSite(siteId: string | undefined) {
    if (sites.value.length === 0) await getSites()
    currentSiteId.value = siteId
    if (siteId) await getSite(siteId)
    return currentSite.value
  }

  async function getSite(siteId: string) {
    loadingSites.value = true
    try {
      const response = await ceApi.site(siteId)
      const existingSite = sites.value.find(site => site.id === response.site.id)
      const site = mergeSiteMedia(existingSite, response.site)
      siteDetails.value = { ...siteDetails.value, [site.id]: site }
      const index = sites.value.findIndex(site => site.id === response.site.id)
      const { files: _files, folders: _folders, ...siteSummary } = site
      if (index >= 0) {
        sites.value[index] = mergeSiteMedia(sites.value[index], siteSummary as Site)
      } else {
        sites.value.push(siteSummary as Site)
      }
      return site
    } finally {
      loadingSites.value = false
    }
  }

  async function createSite(name: string) {
    try {
      const response = await ceApi.createSite(name)
      siteDetails.value = { ...siteDetails.value, [response.site.id]: response.site }
      await getSites()
      currentSiteId.value = response.site.id
      alert.add({ message: `Site "${response.site.name}" created.`, type: 'success', timeout: 3000 })
      return response.site
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'Site could not be created.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function updateCurrentSite(
    input: { name?: string; visibility?: string; icon?: string; attributes?: Record<string, unknown> } = {},
    options: { successMessage?: string; silent?: boolean } = {},
  ) {
    if (!currentSiteId.value) throw new Error('No current site selected')
    try {
      const response = await ceApi.updateSite(currentSiteId.value, input)
      const index = sites.value.findIndex(site => site.id === response.site.id)
      const site = mergeSiteMedia(currentSite.value ?? undefined, response.site)
      if (index >= 0) sites.value[index] = mergeSiteMedia(sites.value[index], site)
      else sites.value.push(site)
      siteDetails.value = { ...siteDetails.value, [site.id]: site }
      if (!options.silent) {
        alert.add({ message: options.successMessage ?? 'Site settings saved.', type: 'success', timeout: 3000 })
      }
      return site
    } catch (error) {
      if (!options.silent) {
        alert.add({
          message: error instanceof Error ? error.message : 'Site settings could not be saved.',
          type: 'error',
          timeout: 5000,
        })
      }
      throw error
    }
  }

  async function updateSiteMedia(mediaType: string, dataUrl: string) {
    const attributes = currentSite.value?.attributes ?? {}
    const media = {
      ...((attributes.media as Record<string, unknown> | undefined) ?? {}),
      [mediaType]: { dataUrl },
    }
    return updateCurrentSite({ attributes: { media } })
  }

  async function deleteMedia(mediaType: string) {
    const attributes = currentSite.value?.attributes ?? {}
    const media = { ...((attributes.media as Record<string, unknown> | undefined) ?? {}) }
    media[mediaType] = null
    return updateCurrentSite({ attributes: { media } })
  }

  async function acceptSiteInvitation(siteId: string) {
    try {
      await ceApi.acceptSiteInvitation(siteId)
      await Promise.all([getSites(), getSuppressedSites()])
      alert.add({ message: 'Site invitation accepted.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'Site invitation could not be accepted.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function declineSiteInvitation(siteId: string) {
    try {
      await ceApi.declineSiteInvitation(siteId)
      await Promise.all([getSites(), getSuppressedSites()])
      alert.add({ message: 'Site invitation declined.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'Site invitation could not be declined.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function suppressSiteInvitation(siteId: string) {
    try {
      await ceApi.suppressSiteInvitation(siteId)
      await Promise.all([getSites(), getSuppressedSites()])
      alert.add({ message: 'Site blocked.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'Site could not be blocked.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  return { sites, siteDetails, sitesWithAttributes, ownedSitesWithAttributes, suppressedSites, currentSiteId, currentSite, activeTab, loadingSites, loadingSuppressedSites, getSites, getSitesIfRequired, getSite, getSuppressedSites, getSuppressedSitesIfRequired, setCurrentSite, createSite, updateCurrentSite, updateSiteMedia, deleteMedia, acceptSiteInvitation, declineSiteInvitation, suppressSiteInvitation }
})
