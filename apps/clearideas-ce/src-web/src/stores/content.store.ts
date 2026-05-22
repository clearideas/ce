import { BinaryUploadBodyRequestSchema } from '@clearideas/contracts-core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ceApi } from '../api/client'
import type { FileItem, Folder } from '../types/domain'
import { useAlert } from '../composables/useAlert'
import { contentTypeIconName } from '../utils/format'
import { useSiteStore } from './site.store'

type RequestSchema<T> = {
  safeParse: (payload: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<PropertyKey>; message: string }> } }
}

function validateRequest<T>(schema: RequestSchema<T>, payload: unknown, context: string): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  const message = result.error.issues
    .map(issue => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
    .join('; ')
  throw new Error(`${context} payload is invalid: ${message}`)
}

export const useContentStore = defineStore('content', () => {
  const activeTab = ref<'content' | 'users' | 'settings' | 'ai'>('content')
  const activeFolderId = ref<string | undefined>()
  const ancestors = ref<any[]>([])
  const latestContents = ref<any[]>([])
  const bookmarksWithIcons = ref<any[]>([])
  const enableSortable = ref(false)
  const loading = ref(false)
  const currentProgress = ref<number[]>([])
  const isUploading = ref(false)
  const isIndeterminate = ref(false)
  const isUploadingError = ref(false)
  const isSearching = ref(false)
  const showSearchResults = ref(false)
  const searchQuery = ref('')
  const searchResults = ref<FileItem[]>([])
  const searchScope = ref<{ type: 'all' | 'site'; siteId?: string; label: string }>({
    type: 'all',
    label: 'all sites',
  })
  const file = ref<FileItem | null>(null)
  const fileError = ref(false)
  const siteStore = useSiteStore()
  const alert = useAlert()
  const folders = computed(() => siteStore.currentSite?.folders ?? [])
  const rootFiles = computed(() => siteStore.currentSite?.files ?? [])
  const contents = computed(() => {
    if (activeFolderId.value) {
      const folder = folders.value.find(folder => folder.id === activeFolderId.value)
      const childFolders = folders.value.filter(candidate => candidate.parentId === activeFolderId.value)
      return [
        ...childFolders.map((childFolder, folderIndex) => ({
          id: childFolder.id,
          site: siteStore.currentSite?.id,
          parent: folder?.id,
          parentName: folder?.name,
          parentType: 'Folder',
          kind: 'folder',
          name: childFolder.name,
          rank: folderIndex + 1,
          updatedAt: childFolder.updatedAt,
          attributes: { icon: 'fa-folder' },
          tags: [],
        })),
        ...(folder?.files ?? []).map((file, fileIndex) => ({
          ...file,
          site: siteStore.currentSite?.id,
          parent: folder?.id,
          parentName: folder?.name,
          parentType: 'Folder',
          folderId: folder?.id,
          folderName: folder?.name,
          kind: 'file',
          rank: childFolders.length + fileIndex + 1,
          updatedAt: file.updatedAt ?? file.uploadedAt,
          attributes: { icon: contentTypeIconName((file as any).contentType ?? (file as any).type), ...(file as any).attributes },
          tags: (file as any).tags ?? [],
          contentType: (file as any).contentType ?? (file as any).type,
          viewUrl: `/api/files/view/${encodeURIComponent(String(file.id ?? ''))}`,
          downloadUrl: `/api/files/download/${encodeURIComponent(String(file.id ?? ''))}`,
        })),
      ]
    }

    const rootFolders = folders.value.filter(folder => !folder.parentId)
    return [
      ...rootFiles.value.map((file, fileIndex) => ({
        ...file,
        site: siteStore.currentSite?.id,
        parent: siteStore.currentSite?.id,
        parentType: 'Site',
        kind: 'file',
        rank: fileIndex + 1,
        updatedAt: file.updatedAt ?? file.uploadedAt,
        attributes: { icon: contentTypeIconName((file as any).contentType ?? (file as any).type), ...(file as any).attributes },
        tags: (file as any).tags ?? [],
        contentType: (file as any).contentType ?? (file as any).type,
        viewUrl: `/api/files/view/${encodeURIComponent(String(file.id ?? ''))}`,
        downloadUrl: `/api/files/download/${encodeURIComponent(String(file.id ?? ''))}`,
      })),
      ...rootFolders.map((folder, folderIndex) => ({
        id: folder.id,
        site: siteStore.currentSite?.id,
        parent: siteStore.currentSite?.id,
        parentType: 'Site',
        kind: 'folder',
        name: folder.name,
        rank: rootFiles.value.length + folderIndex + 1,
        updatedAt: folder.updatedAt,
        attributes: { icon: 'fa-folder' },
        tags: [],
      })),
    ]
  })

  async function createFolder(siteId: string, name: string, folderId?: string) {
    loading.value = true
    try {
      const response = await ceApi.createFolder(siteId, name, folderId)
      await siteStore.getSite(siteId)
      alert.add({ message: `Folder "${name}" created.`, type: 'success', timeout: 3000 })
      return response.folder
    } catch (error: any) {
      alert.add({ message: error?.message || 'Could not create folder.', type: 'error', timeout: 5000 })
      throw error
    } finally {
      loading.value = false
    }
  }

  async function deleteContent(siteId: string, contentId: string) {
    loading.value = true
    try {
      const existing = contents.value.find(content => content.id === contentId)
      await ceApi.deleteContent(siteId, contentId)
      await siteStore.getSite(siteId)
      alert.add({ message: `"${existing?.name ?? 'Content'}" deleted.`, type: 'success', timeout: 3000 })
    } catch (error: any) {
      alert.add({ message: error?.message || 'Could not delete content.', type: 'error', timeout: 5000 })
      throw error
    } finally {
      loading.value = false
    }
  }

  async function updateContent(siteId: string, contentId: string, input: { name: string }) {
    loading.value = true
    try {
      const response = await ceApi.updateContent(siteId, contentId, input)
      await siteStore.getSite(siteId)
      alert.add({ message: `"${input.name}" renamed.`, type: 'success', timeout: 3000 })
      return response.content
    } catch (error: any) {
      alert.add({ message: error?.message || 'Could not rename content.', type: 'error', timeout: 5000 })
      throw error
    } finally {
      loading.value = false
    }
  }

  function inferUploadContentType(file: File) {
    if (file.type) return file.type
    const extension = file.name.toLowerCase().split('.').pop()
    switch (extension) {
      case 'json':
        return 'application/json'
      case 'md':
      case 'markdown':
        return 'text/markdown'
      case 'txt':
      case 'log':
        return 'text/plain'
      case 'csv':
        return 'text/csv'
      case 'xml':
        return 'application/xml'
      case 'yaml':
      case 'yml':
        return 'application/yaml'
      case 'js':
      case 'mjs':
      case 'cjs':
        return 'text/javascript'
      case 'css':
        return 'text/css'
      case 'html':
      case 'htm':
        return 'text/html'
      default:
        return 'application/octet-stream'
    }
  }

  function putUploadBody(input: { url: string; method?: string; headers?: Record<string, string>; file: File; contentType: string; progressIndex: number }) {
    validateRequest(BinaryUploadBodyRequestSchema, input.file, 'Upload file')
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const uploadUrl = new URL(input.url, window.location.origin)
      xhr.open(input.method ?? 'PUT', uploadUrl.toString())
      xhr.withCredentials = true
      xhr.upload.onprogress = event => {
        if (!event.lengthComputable) {
          isIndeterminate.value = true
          return
        }
        currentProgress.value[input.progressIndex] = Math.floor((event.loaded / event.total) * 100)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else {
          const message = xhr.responseText ? `Upload failed with status ${xhr.status}: ${xhr.responseText}` : `Upload failed with status ${xhr.status}`
          reject(new Error(message))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.setRequestHeader('content-type', input.contentType)
      for (const [key, value] of Object.entries(input.headers ?? {})) xhr.setRequestHeader(key, value)
      xhr.send(input.file)
    })
  }

  async function uploadFile(input: { siteId: string; folderId?: string; file: File; progressIndex: number }) {
    loading.value = true
    try {
      const contentType = inferUploadContentType(input.file)
      const { target } = await ceApi.uploadTarget({
        siteId: input.siteId,
        folderId: input.folderId,
        fileName: input.file.name,
        contentType,
        size: input.file.size,
      })
      await putUploadBody({
        url: target.url,
        method: target.method,
        headers: target.headers,
        file: input.file,
        contentType,
        progressIndex: input.progressIndex,
      })
      await siteStore.getSite(input.siteId)
    } finally {
      loading.value = false
    }
  }

  async function putFiles(input: { siteId: string; folderId?: string; files: File[] | FileList; refreshAfterPost?: boolean; processId?: number; progressCallback?: (progress: number | undefined, indeterminate: boolean) => void }) {
    const folderId = input.folderId
    loading.value = true
    isUploading.value = true
    isUploadingError.value = false
    const files = Array.from(input.files)
    currentProgress.value = files.map(() => 0)
    try {
      for (let index = 0; index < files.length; index += 1) {
        await uploadFile({ siteId: input.siteId, folderId, file: files[index], progressIndex: index })
        currentProgress.value[index] = 100
        input.progressCallback?.(Math.round(((index + 1) / files.length) * 100), isIndeterminate.value)
      }
      if (input.refreshAfterPost) await siteStore.getSite(input.siteId)
      alert.add({ message: `${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded.`, type: 'success', timeout: 3000 })
    } catch (error) {
      isUploadingError.value = true
      alert.add({ message: error instanceof Error ? error.message : 'Upload failed.', type: 'error', timeout: 5000 })
      throw error
    } finally {
      isUploading.value = false
      isIndeterminate.value = false
      loading.value = false
      setTimeout(() => { currentProgress.value = [] }, 3000)
    }
  }

  async function search(siteId?: string, q = searchQuery.value) {
    isSearching.value = true
    try {
      const data = siteId ? await ceApi.searchSite(siteId, q) : await ceApi.searchAll(q)
      searchResults.value = data.results ?? data.contents ?? []
      searchScope.value = siteId
        ? {
          type: 'site',
          siteId,
          label: siteStore.sites.find(site => site.id === siteId)?.name ?? siteStore.currentSite?.name ?? 'current site',
        }
        : { type: 'all', label: 'all sites' }
      showSearchResults.value = true
      return searchResults.value
    } finally {
      isSearching.value = false
    }
  }

  async function getFile(siteId: string, fileId: string) {
    loading.value = true
    fileError.value = false
    try {
      const response = await ceApi.file(siteId, fileId)
      file.value = response.file
      ancestors.value = [
        ...(response.file.folderId ? [{ id: response.file.folderId, name: response.file.folderName || 'Folder', kind: 'folder' }] : []),
        { id: response.file.id, name: response.file.name, kind: 'file' },
      ]
      return response.file
    } catch (error) {
      file.value = null
      fileError.value = true
      throw error
    } finally {
      loading.value = false
    }
  }

  async function getFileBlob(fileInput = file.value) {
    const url = await createFileAccessUrl(fileInput, 'view')
    if (!url) throw new Error('No view URL available')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`)
    const blob = await response.blob()
    return {
      blob,
      data: new Uint8Array(await blob.arrayBuffer()),
      contentType: blob.type || fileInput.contentType || 'application/octet-stream',
    }
  }

  function getFileDownloadUrl(fileInput = file.value) {
    return fileInput?.downloadUrl ?? ''
  }

  async function createFileAccessUrl(fileInput = file.value, purpose: 'view' | 'download' = 'view') {
    if (!fileInput?.site || !fileInput?.id) return ''
    const target = await ceApi.fileToken(String(fileInput.site), String(fileInput.id), purpose)
    return target.url
  }

  return {
    activeTab,
    activeFolderId,
    ancestors,
    latestContents,
    bookmarksWithIcons,
    enableSortable,
    loading,
    currentProgress,
    isUploading,
    isIndeterminate,
    isUploadingError,
    isSearching,
    showSearchResults,
    searchQuery,
    searchResults,
    searchScope,
    file,
    fileError,
    folders,
    contents,
    createFolder,
    deleteContent,
    updateContent,
    uploadFile,
    putFiles,
    search,
    getFile,
    getFileBlob,
    getFileDownloadUrl,
    createFileAccessUrl,
  }
})
