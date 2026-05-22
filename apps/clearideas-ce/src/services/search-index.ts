import MiniSearch from 'minisearch'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { StorageProvider } from '@clearideas/core/providers'
import {
  isTextBasedContent,
  parseMetadataSearchQuery,
  searchableMetadataValues,
  type ParsedMetadataSearch,
} from '@clearideas/core'
import { config } from '../config/index.js'

export interface SearchIndexFile {
  id: string
  siteId: string
  siteName?: string
  folderId?: string
  folderName?: string
  name: string
  key: string
  contentType?: string
  size?: number
  uploadedAt?: string | Date
  updatedAt?: string | Date
  extractedText?: string
  extractedTextKey?: string
  extractionStatus?: string
}

interface SearchDocument {
  id: string
  siteId: string
  siteName: string
  folderId: string
  folderName: string
  name: string
  key: string
  contentType: string
  size?: number
  uploadedAt?: string
  updatedAt?: string
  extractionStatus?: string
  text: string
}

interface LoadedSiteIndex {
  siteId: string
  mini: MiniSearch<SearchDocument>
  documents: Map<string, SearchDocument>
  lastUsedAt: number
  dirty: boolean
  flushPromise?: Promise<void>
}

interface SearchOptions {
  siteId: string
  q: string
  folderId?: string
  limit?: number
}

interface SearchAcrossOptions {
  sites: Array<{ id: string; name?: string }>
  q: string
  limit?: number
}

export class SiteSearchIndexManager {
  private indexes = new Map<string, LoadedSiteIndex>()
  private readonly idleMs: number
  private readonly maxLoadedSites: number

  constructor(
    private readonly input: { root: string; storage: StorageProvider },
  ) {
    this.idleMs = config.search.idleMs()
    this.maxLoadedSites = config.search.maxLoadedSites()
  }

  async indexFile(file: SearchIndexFile) {
    const index = await this.loadSiteIndex(file.siteId)
    const text = await this.getSearchText(file)
    const document: SearchDocument = {
      id: file.id,
      siteId: file.siteId,
      siteName: file.siteName ?? '',
      folderId: file.folderId ?? '',
      folderName: file.folderName ?? '',
      name: file.name,
      key: file.key,
      contentType: file.contentType ?? '',
      size: file.size,
      uploadedAt: serializeDate(file.uploadedAt),
      updatedAt: serializeDate(file.updatedAt ?? file.uploadedAt),
      extractionStatus: file.extractionStatus,
      text,
    }
    if (index.mini.has(document.id)) index.mini.discard(document.id)
    index.documents.set(document.id, document)
    index.mini.add(document)
    index.dirty = true
    await this.flush(index)
  }

  async removeContent(siteId: string, contentIds: string[]) {
    if (contentIds.length === 0) return
    const index = await this.loadSiteIndex(siteId)
    let changed = false
    for (const contentId of contentIds) {
      if (!index.documents.has(contentId)) continue
      index.documents.delete(contentId)
      if (index.mini.has(contentId)) index.mini.discard(contentId)
      changed = true
    }
    if (!changed) return
    index.dirty = true
    await this.flush(index)
  }

  async searchSite(input: SearchOptions) {
    const parsed = parseMetadataSearchQuery(input.q)
    const index = await this.loadSiteIndex(input.siteId)
    const limit = normalizeLimit(input.limit)
    const candidates = parsed.plainText
      ? index.mini.search(parsed.plainText, {
          prefix: true,
          fuzzy: 0.2,
          boost: { name: 4, contentType: 2, text: 1 },
        })
      : [...index.documents.values()]

    return candidates
      .map(result => ('id' in result ? index.documents.get(String(result.id)) : result))
      .filter((doc): doc is SearchDocument => Boolean(doc))
      .filter(doc => !input.folderId || doc.folderId === input.folderId)
      .filter(doc => matchesMetadataFilters(doc, parsed.filters))
      .slice(0, limit)
      .map(doc => toSearchResult(doc, parsed.plainText))
  }

  async searchAcrossSites(input: SearchAcrossOptions) {
    const results: ReturnType<typeof toSearchResult>[] = []
    const limit = normalizeLimit(input.limit)
    for (const site of input.sites) {
      const siteResults = await this.searchSite({ siteId: site.id, q: input.q, limit })
      for (const result of siteResults) {
        results.push({ ...result, siteName: result.siteName || site.name || '' })
        if (results.length >= limit) return results
      }
    }
    return results
  }

  unloadIdleIndexes() {
    const now = Date.now()
    for (const [siteId, index] of this.indexes.entries()) {
      if (index.dirty || now - index.lastUsedAt < this.idleMs) continue
      this.indexes.delete(siteId)
    }

    const loaded = [...this.indexes.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    while (loaded.length > this.maxLoadedSites) {
      const candidate = loaded.shift()
      if (!candidate || candidate.dirty) continue
      this.indexes.delete(candidate.siteId)
    }
  }

  private async loadSiteIndex(siteId: string): Promise<LoadedSiteIndex> {
    const current = this.indexes.get(siteId)
    if (current) {
      current.lastUsedAt = Date.now()
      return current
    }

    const mini = new MiniSearch<SearchDocument>({
      fields: [...config.search.fields],
      storeFields: [...config.search.storeFields],
    })
    const documents = new Map<string, SearchDocument>()
    const dir = this.siteDir(siteId)

    try {
      const [indexText, documentsText] = await Promise.all([
        fs.readFile(path.join(dir, 'index.json'), 'utf8'),
        fs.readFile(path.join(dir, 'documents.json'), 'utf8'),
      ])
      const loaded = MiniSearch.loadJSON<SearchDocument>(indexText, {
        fields: [...config.search.fields],
        storeFields: [...config.search.storeFields],
      })
      const storedDocuments = JSON.parse(documentsText) as SearchDocument[]
      for (const document of storedDocuments) documents.set(document.id, document)
      const index = { siteId, mini: loaded, documents, lastUsedAt: Date.now(), dirty: false }
      this.indexes.set(siteId, index)
      this.unloadIdleIndexes()
      return index
    } catch {
      const index = { siteId, mini, documents, lastUsedAt: Date.now(), dirty: false }
      this.indexes.set(siteId, index)
      this.unloadIdleIndexes()
      return index
    }
  }

  private async flush(index: LoadedSiteIndex) {
    if (index.flushPromise) await index.flushPromise
    index.flushPromise = (async () => {
      const dir = this.siteDir(index.siteId)
      await fs.mkdir(dir, { recursive: true })
      await Promise.all([
        fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(index.mini), 'utf8'),
        fs.writeFile(path.join(dir, 'documents.json'), JSON.stringify([...index.documents.values()]), 'utf8'),
      ])
      index.dirty = false
      index.flushPromise = undefined
      this.unloadIdleIndexes()
    })()
    await index.flushPromise
  }

  private siteDir(siteId: string) {
    return path.join(this.input.root, 'sites', siteId)
  }

  private async getSearchText(file: SearchIndexFile) {
    if (typeof file.extractedText === 'string' && file.extractedText.trim()) return file.extractedText
    if (file.extractedTextKey) {
      return (await this.input.storage.readObject({ key: file.extractedTextKey })).toString('utf8')
    }
    if (isTextBasedContent(file.contentType, file.name)) {
      return (await this.input.storage.readObject({ key: file.key })).toString('utf8')
    }
    return ''
  }
}

export function createSiteSearchIndexManager(input: { root: string; storage: StorageProvider }) {
  return new SiteSearchIndexManager(input)
}

function toSearchResult(doc: SearchDocument, query = '') {
  return {
    id: doc.id,
    kind: 'file',
    name: doc.name,
    key: doc.key,
    size: doc.size,
    contentType: doc.contentType,
    folderId: doc.folderId,
    folderName: doc.folderName,
    siteId: doc.siteId,
    siteName: doc.siteName,
    updatedAt: doc.updatedAt,
    extractionStatus: doc.extractionStatus,
    textAvailable: Boolean(doc.text.trim()),
    snippet: createSnippet(doc.text, query),
  }
}

function createSnippet(text: string, query: string) {
  const cleanText = text.replace(/\s+/g, ' ').trim()
  if (!cleanText) return ''
  const terms = query
    .split(/\s+/)
    .map(term => term.trim().toLowerCase())
    .filter(term => term.length > 1)
  const firstMatch = terms
    .map(term => cleanText.toLowerCase().indexOf(term))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, firstMatch - 160)
  const end = Math.min(cleanText.length, firstMatch + 420)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < cleanText.length ? '...' : ''
  return `${prefix}${cleanText.slice(start, end)}${suffix}`
}

function normalizeLimit(limit?: number) {
  return Math.max(1, Math.min(limit ?? 50, 200))
}

function serializeDate(value: unknown) {
  if (!value) return undefined
  return value instanceof Date ? value.toISOString() : String(value)
}

function matchesMetadataFilters(doc: SearchDocument, filters: ParsedMetadataSearch['filters']) {
  return filters.every(filter => {
    const values = searchableMetadataValues({ file: doc, key: filter.key })
    return values.some(value => value.includes(filter.value))
  })
}
