import MiniSearch from 'minisearch'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { StorageProvider } from '@clearideas/core/providers'
import {
  isTextBasedContent,
  matchesMetadataFilters,
  normalizeSearchText,
  parseMetadataSearchQuery,
  type ParsedMetadataSearch,
} from '@clearideas/core'
import { config } from '../config/index.js'
import { createTaskQueue, type TaskQueue } from './task-queue.js'

/**
 * Persisted index file format. Bump when the on-disk shape changes; older files are
 * quarantined and the site index is rebuilt from the source of truth.
 */
export const SEARCH_INDEX_FORMAT_VERSION = 2
const INDEX_FILE_NAME = 'index.json'

export interface SearchIndexFile {
  id: string
  siteId: string
  siteName?: string
  siteTags?: string[]
  folderId?: string
  folderName?: string
  name: string
  key: string
  contentType?: string
  size?: number
  uploadedAt?: string | Date
  createdAt?: string | Date
  updatedAt?: string | Date
  tags?: string[]
  metadata?: Record<string, unknown>
  extractedText?: string
  extractedTextKey?: string
  extractionStatus?: string
}

/**
 * Source of truth used to (re)build site indexes. The index itself is a disposable
 * cache: if its persisted form is missing or unreadable it is rebuilt from here.
 */
export interface SearchIndexSource {
  listSiteFiles(input: { siteId: string; updatedAfter?: Date; folderId?: string }): Promise<SearchIndexFile[]>
  getSiteFile(input: { siteId: string; contentId: string }): Promise<SearchIndexFile | null>
}

export interface SearchIndexLogger {
  info(message: string, details?: Record<string, unknown>): void
  warn(message: string, details?: Record<string, unknown>): void
  error(message: string, details?: Record<string, unknown>): void
}

export interface SiteSearchIndexManagerOptions {
  root: string
  storage: StorageProvider
  source?: SearchIndexSource
  logger?: SearchIndexLogger
  idleMs?: number
  maxLoadedSites?: number
  flushDelayMs?: number
  maxTextBytes?: number
  indexConcurrency?: number
  /** Rebuild a site index from `source` when its persisted form is missing or corrupt. */
  autoRebuild?: boolean
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
  createdAt?: string
  updatedAt?: string
  tags: string[]
  siteTags: string[]
  metadata: Record<string, unknown>
  extractedTextKey: string
  extractionStatus?: string
  textAvailable: boolean
  textTruncated: boolean
}

interface LoadedSiteIndex {
  siteId: string
  mini: MiniSearch<SearchDocument & { text: string }>
  documents: Map<string, SearchDocument>
  /** ISO timestamp of the newest `updatedAt` indexed; used for incremental catch-up on load. */
  watermark: string
  lastUsedAt: number
  dirty: boolean
  activeOps: number
  pendingMutations: number
  flushTimer?: NodeJS.Timeout
  flushChain: Promise<void>
  flushing: number
  flushFailures: number
  mutex: Promise<void>
}

interface PersistedSiteIndex {
  format: number
  siteId: string
  savedAt: string
  watermark: string
  documents: SearchDocument[]
  index: unknown
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

export interface SearchHit {
  id: string
  kind: 'file'
  name: string
  key: string
  size?: number
  contentType: string
  folderId: string
  folderName: string
  siteId: string
  siteName: string
  updatedAt?: string
  extractionStatus?: string
  textAvailable: boolean
  score: number
  snippet: string
}

interface RawHit {
  doc: SearchDocument
  score: number
}

const defaultLogger: SearchIndexLogger = {
  info: (message, details) => console.info(`[clearideas-ce:search] ${message}`, details ?? ''),
  warn: (message, details) => console.warn(`[clearideas-ce:search] ${message}`, details ?? ''),
  error: (message, details) => console.error(`[clearideas-ce:search] ${message}`, details ?? ''),
}

export class SiteSearchIndexManager {
  private readonly indexes = new Map<string, LoadedSiteIndex>()
  private readonly loading = new Map<string, Promise<LoadedSiteIndex>>()
  private readonly pendingContent = new Set<string>()
  private readonly queue: TaskQueue
  private readonly logger: SearchIndexLogger
  private readonly idleMs: number
  private readonly maxLoadedSites: number
  private readonly flushDelayMs: number
  private readonly maxTextBytes: number
  private readonly autoRebuild: boolean
  private readonly evictionTimer: NodeJS.Timeout
  private closed = false
  private closing?: Promise<void>

  constructor(private readonly input: SiteSearchIndexManagerOptions) {
    this.logger = input.logger ?? defaultLogger
    this.idleMs = input.idleMs ?? config.search.idleMs()
    this.maxLoadedSites = input.maxLoadedSites ?? config.search.maxLoadedSites()
    this.flushDelayMs = input.flushDelayMs ?? config.search.flushDelayMs()
    this.maxTextBytes = input.maxTextBytes ?? config.search.maxTextBytes()
    this.autoRebuild = input.autoRebuild ?? true
    this.queue = createTaskQueue({ concurrency: input.indexConcurrency ?? config.search.indexConcurrency() })
    this.evictionTimer = setInterval(() => this.unloadIdleIndexes(), Math.min(this.idleMs, 60_000))
    this.evictionTimer.unref?.()
  }

  // ---------------------------------------------------------------------------
  // Indexing
  // ---------------------------------------------------------------------------

  /** Adds or replaces a document. Text is read (bounded) from storage; persistence is coalesced. */
  async indexFile(file: SearchIndexFile) {
    this.assertOpen()
    const siteId = String(file.siteId)
    const text = await this.getSearchText(file)
    await this.withIndex(siteId, index =>
      this.runExclusive(index, () => {
        this.applyDocument(index, toSearchDocument(file, text))
        this.markDirty(index)
      }),
    )
  }

  async removeContent(siteId: string, contentIds: string[]) {
    if (contentIds.length === 0) return
    this.assertOpen()
    // Nothing to remove when the site has no index at all (e.g. the site itself was deleted);
    // avoid creating one just to record a deletion.
    if (!this.indexes.has(siteId) && !this.loading.has(siteId) && !(await this.hasPersistedIndex(siteId))) return
    await this.withIndex(siteId, index =>
      this.runExclusive(index, () => {
        let changed = false
        for (const contentId of contentIds) {
          const id = String(contentId)
          if (index.documents.delete(id)) changed = true
          if (index.mini.has(id)) {
            index.mini.discard(id)
            changed = true
          }
        }
        if (changed) this.markDirty(index)
      }),
    )
  }

  /** Removes a site's index from memory and disk (used when a site is deleted). */
  async removeSite(siteId: string) {
    const inflight = this.loading.get(siteId)
    if (inflight) await inflight.catch(() => undefined)
    const index = this.indexes.get(siteId)
    if (index) {
      if (index.flushTimer) clearTimeout(index.flushTimer)
      index.flushTimer = undefined
      index.dirty = false
      await index.flushChain.catch(() => undefined)
      this.indexes.delete(siteId)
    }
    await fs.rm(this.siteDir(siteId), { recursive: true, force: true })
  }

  /** Propagates a folder rename to indexed documents without re-reading their text. */
  async updateFolderName(siteId: string, folderId: string, folderName: string) {
    await this.updateDocuments(siteId, doc => {
      if (doc.folderId !== String(folderId)) return false
      doc.folderName = String(folderName ?? '')
      return true
    })
  }

  /** Propagates a site rename to indexed documents without re-reading their text. */
  async updateSiteName(siteId: string, siteName: string) {
    await this.updateDocuments(siteId, doc => {
      doc.siteName = String(siteName ?? '')
      return true
    })
  }

  /** True when the loaded index for `siteId` contains `contentId` (false if the site is not loaded). */
  hasDocument(siteId: string, contentId: string): boolean {
    return this.indexes.get(String(siteId))?.documents.has(String(contentId)) ?? false
  }

  /**
   * Rebuilds a site index from the configured source. Returns the number of documents indexed.
   */
  async rebuildSiteIndex(siteId: string): Promise<number> {
    this.assertOpen()
    const source = this.requireSource()
    const index = await this.loadSiteIndex(siteId, { autoRebuild: false })
    index.activeOps += 1
    try {
      const count = await this.runExclusive(index, () => this.rebuildLoadedIndex(index, source))
      await this.flushSite(index)
      return count
    } finally {
      index.activeOps -= 1
      index.lastUsedAt = Date.now()
    }
  }

  /** Schedules background (re)indexing of a single content item from the source of truth. */
  enqueueIndexContent(siteId: string, contentId: string): void {
    if (this.closed || this.closing || !this.input.source) return
    const key = `${siteId}:${contentId}`
    if (this.pendingContent.has(key)) return
    this.pendingContent.add(key)
    const source = this.input.source
    void this.queue
      .run(async () => {
        this.pendingContent.delete(key)
        const file = await source.getSiteFile({ siteId: String(siteId), contentId: String(contentId) })
        if (!file) {
          await this.removeContent(String(siteId), [String(contentId)])
          return
        }
        await this.indexFile(file)
      })
      .catch(error => {
        this.pendingContent.delete(key)
        this.logger.warn('Background indexing failed', { siteId, contentId, error: errorMessage(error) })
      })
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async searchSite(input: SearchOptions): Promise<SearchHit[]> {
    this.assertOpen()
    const parsed = parseMetadataSearchQuery(input.q)
    const limit = normalizeLimit(input.limit)
    const hits = await this.withIndex(String(input.siteId), index =>
      this.rawSearch(index, parsed, { folderId: input.folderId, limit }),
    )
    return this.withSnippets(hits, parsed)
  }

  /**
   * Searches several sites and merges results by relevance score (not by site order).
   */
  async searchAcrossSites(input: SearchAcrossOptions): Promise<SearchHit[]> {
    return (await this.searchAcrossSitesDetailed(input)).hits
  }

  /**
   * Like `searchAcrossSites`, but also reports which sites had matches *before* the merged
   * result list was truncated to `limit` (used to attribute a search to the sites it hit).
   */
  async searchAcrossSitesDetailed(input: SearchAcrossOptions): Promise<{ hits: SearchHit[]; matchedBySite: Map<string, string[]> }> {
    this.assertOpen()
    const parsed = parseMetadataSearchQuery(input.q)
    const limit = normalizeLimit(input.limit)
    const collected: RawHit[] = []
    const matchedBySite = new Map<string, string[]>()
    for (const site of input.sites) {
      const siteId = String(site.id)
      const hits = await this.withIndex(siteId, index => this.rawSearch(index, parsed, { limit }))
      if (hits.length > 0) matchedBySite.set(siteId, hits.map(hit => hit.doc.id))
      for (const hit of hits) {
        collected.push(site.name && !hit.doc.siteName ? { ...hit, doc: { ...hit.doc, siteName: site.name } } : hit)
      }
    }
    collected.sort((a, b) => b.score - a.score || compareDesc(a.doc.updatedAt, b.doc.updatedAt))
    return { hits: await this.withSnippets(collected.slice(0, limit), parsed), matchedBySite }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Persists every dirty index immediately. */
  async flushAll() {
    await Promise.all([...this.indexes.values()].map(index => this.flushSite(index)))
  }

  /** Waits for background indexing to finish and persists all pending changes (useful in tests and scripts). */
  async settle() {
    await this.queue.idle()
    await this.flushAll()
  }

  close(): Promise<void> {
    if (!this.closing) {
      clearInterval(this.evictionTimer)
      this.closing = this.drainAndClose()
    }
    return this.closing
  }

  private async drainAndClose() {
    await this.queue.idle()
    await Promise.all([...this.loading.values()].map(promise => promise.catch(() => undefined)))
    this.closed = true
    await this.flushAll()
  }

  unloadIdleIndexes() {
    const now = Date.now()
    for (const [siteId, index] of this.indexes.entries()) {
      if (!this.isEvictable(index)) continue
      if (now - index.lastUsedAt < this.idleMs) continue
      this.indexes.delete(siteId)
    }
    this.enforceCapacity()
  }

  get loadedSiteCount() {
    return this.indexes.size
  }

  // ---------------------------------------------------------------------------
  // Internals: documents
  // ---------------------------------------------------------------------------

  private applyDocument(index: LoadedSiteIndex, document: SearchDocument & { text: string }) {
    const { text, ...stored } = document
    if (index.mini.has(stored.id)) index.mini.discard(stored.id)
    index.mini.add({ ...stored, text })
    index.documents.set(stored.id, stored)
    if (stored.updatedAt && (!index.watermark || stored.updatedAt > index.watermark)) {
      index.watermark = stored.updatedAt
    }
  }

  private async updateDocuments(siteId: string, mutate: (doc: SearchDocument) => boolean) {
    this.assertOpen()
    await this.withIndex(String(siteId), index =>
      this.runExclusive(index, () => {
        let changed = false
        for (const doc of index.documents.values()) {
          if (mutate(doc)) changed = true
        }
        if (changed) this.markDirty(index)
      }),
    )
  }

  private async rebuildLoadedIndex(index: LoadedSiteIndex, source: SearchIndexSource): Promise<number> {
    const startedAt = Date.now()
    const files = await source.listSiteFiles({ siteId: index.siteId })
    const mini = this.createMiniSearch()
    const documents = new Map<string, SearchDocument>()
    let watermark = ''
    for (const file of files) {
      const text = await this.getSearchText(file)
      const document = toSearchDocument(file, text)
      const { text: body, ...stored } = document
      mini.add({ ...stored, text: body })
      documents.set(stored.id, stored)
      if (stored.updatedAt && stored.updatedAt > watermark) watermark = stored.updatedAt
    }
    index.mini = mini
    index.documents = documents
    index.watermark = watermark
    this.markDirty(index)
    this.logger.info('Rebuilt site search index', {
      siteId: index.siteId,
      documents: documents.size,
      durationMs: Date.now() - startedAt,
    })
    return documents.size
  }

  private async catchUp(index: LoadedSiteIndex, source: SearchIndexSource) {
    if (!index.watermark) return
    const since = new Date(index.watermark)
    if (Number.isNaN(since.getTime())) return
    let files: SearchIndexFile[]
    try {
      files = await source.listSiteFiles({ siteId: index.siteId, updatedAfter: since })
    } catch (error) {
      this.logger.warn('Incremental index catch-up failed', { siteId: index.siteId, error: errorMessage(error) })
      return
    }
    // `updatedAfter` is inclusive, so the newest indexed document comes back too; skip anything unchanged.
    const changed = files.filter(file => !isUnchanged(index.documents.get(String(file.id)), file))
    if (changed.length === 0) return
    const documents: Array<SearchDocument & { text: string }> = []
    for (const file of changed) documents.push(toSearchDocument(file, await this.getSearchText(file)))
    await this.runExclusive(index, () => {
      for (const document of documents) this.applyDocument(index, document)
      this.markDirty(index)
    })
    this.logger.info('Caught up site search index', { siteId: index.siteId, documents: documents.length })
  }

  // ---------------------------------------------------------------------------
  // Internals: search
  // ---------------------------------------------------------------------------

  private rawSearch(
    index: LoadedSiteIndex,
    parsed: ParsedMetadataSearch,
    options: { folderId?: string; limit: number },
  ): RawHit[] {
    if (!parsed.plainText && parsed.filters.length === 0) return []
    const candidates: RawHit[] = parsed.plainText
      ? index.mini
          .search(parsed.plainText, {
            prefix: true,
            combineWith: config.search.combineWith,
            fuzzy: term => (term.length >= config.search.fuzzyMinTermLength ? config.search.fuzzy : false),
            boost: config.search.boost,
          })
          .flatMap(result => {
            const doc = index.documents.get(String(result.id))
            return doc ? [{ doc, score: result.score }] : []
          })
      : [...index.documents.values()]
          .sort((a, b) => compareDesc(a.updatedAt, b.updatedAt))
          .map(doc => ({ doc, score: 0 }))

    const folderId = options.folderId ? String(options.folderId) : ''
    const hits: RawHit[] = []
    for (const candidate of candidates) {
      if (folderId && candidate.doc.folderId !== folderId) continue
      if (!matchesMetadataFilters({ file: candidate.doc, filters: parsed.filters })) continue
      hits.push(candidate)
      if (hits.length >= options.limit) break
    }
    return hits
  }

  private async withSnippets(hits: RawHit[], parsed: ParsedMetadataSearch): Promise<SearchHit[]> {
    return Promise.all(
      hits.map(async ({ doc, score }) => {
        let snippet = ''
        if (doc.textAvailable) {
          const text = await this.readDocumentText(doc)
          snippet = createSnippet(text, parsed.plainText)
        }
        return toSearchHit(doc, score, snippet)
      }),
    )
  }

  private async readDocumentText(doc: SearchDocument): Promise<string> {
    const result = await this.getSearchText({
      id: doc.id,
      siteId: doc.siteId,
      name: doc.name,
      key: doc.key,
      contentType: doc.contentType,
      extractedTextKey: doc.extractedTextKey || undefined,
    })
    return result.text
  }

  // ---------------------------------------------------------------------------
  // Internals: loading, locking, eviction
  // ---------------------------------------------------------------------------

  private async withIndex<T>(siteId: string, fn: (index: LoadedSiteIndex) => Promise<T> | T): Promise<T> {
    const index = await this.loadSiteIndex(siteId)
    index.activeOps += 1
    index.lastUsedAt = Date.now()
    try {
      return await fn(index)
    } finally {
      index.activeOps -= 1
      index.lastUsedAt = Date.now()
    }
  }

  /** Serialises mutations (and rebuilds) per site so concurrent writers cannot interleave. */
  private runExclusive<T>(index: LoadedSiteIndex, fn: () => Promise<T> | T): Promise<T> {
    index.pendingMutations += 1
    const run = index.mutex.then(fn)
    index.mutex = run.then(
      () => undefined,
      () => undefined,
    )
    return run.finally(() => {
      index.pendingMutations -= 1
    })
  }

  private loadSiteIndex(siteId: string, options: { autoRebuild?: boolean } = {}): Promise<LoadedSiteIndex> {
    const current = this.indexes.get(siteId)
    if (current) {
      current.lastUsedAt = Date.now()
      return Promise.resolve(current)
    }
    const inflight = this.loading.get(siteId)
    if (inflight) return inflight
    const promise = this.loadSiteIndexUncached(siteId, options).finally(() => this.loading.delete(siteId))
    this.loading.set(siteId, promise)
    return promise
  }

  private async loadSiteIndexUncached(siteId: string, options: { autoRebuild?: boolean }): Promise<LoadedSiteIndex> {
    const filePath = path.join(this.siteDir(siteId), INDEX_FILE_NAME)
    let persisted: PersistedSiteIndex | null = null
    let persistedMini: LoadedSiteIndex['mini'] | undefined
    let raw: string | null = null
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.error('Unable to read site search index', { siteId, error: errorMessage(error) })
      }
    }
    if (raw !== null) {
      try {
        persisted = this.deserialize(siteId, raw)
        persistedMini = MiniSearch.loadJS<SearchDocument & { text: string }>(persisted.index as any, this.miniOptions())
      } catch (error) {
        this.logger.error('Site search index is unreadable; quarantining and rebuilding', {
          siteId,
          error: errorMessage(error),
        })
        await this.quarantine(siteId)
        persisted = null
      }
    }

    const index: LoadedSiteIndex = {
      siteId,
      mini: this.createMiniSearch(),
      documents: new Map(),
      watermark: '',
      lastUsedAt: Date.now(),
      dirty: false,
      activeOps: 0,
      pendingMutations: 0,
      flushChain: Promise.resolve(),
      flushing: 0,
      flushFailures: 0,
      mutex: Promise.resolve(),
    }
    if (persisted && persistedMini) {
      index.mini = persistedMini
      for (const document of persisted.documents) index.documents.set(String(document.id), document)
      index.watermark = String(persisted.watermark ?? '')
    }

    // Bring the index fully up to date before anyone can observe it; concurrent callers wait on
    // the shared load promise rather than seeing a half-built index.
    const source = this.input.source
    if (source) {
      if (!persisted && (options.autoRebuild ?? this.autoRebuild)) {
        try {
          await this.runExclusive(index, () => this.rebuildLoadedIndex(index, source))
        } catch (error) {
          this.logger.error('Site search index rebuild failed', { siteId, error: errorMessage(error) })
        }
      } else if (persisted) {
        await this.catchUp(index, source)
      }
    }
    this.indexes.set(siteId, index)
    // The index being loaded is about to be used by the caller; it must never be the eviction victim.
    this.enforceCapacity(index)
    return index
  }

  private async quarantine(siteId: string) {
    const dir = this.siteDir(siteId)
    const suffix = `.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
    for (const name of [INDEX_FILE_NAME, 'documents.json']) {
      const source = path.join(dir, name)
      await fs.rename(source, `${source}${suffix}`).catch(() => undefined)
    }
  }

  private isEvictable(index: LoadedSiteIndex) {
    return (
      !index.dirty &&
      !index.flushTimer &&
      index.flushing === 0 &&
      index.activeOps === 0 &&
      index.pendingMutations === 0
    )
  }

  private enforceCapacity(keep?: LoadedSiteIndex) {
    if (this.indexes.size <= this.maxLoadedSites) return
    const candidates = [...this.indexes.values()]
      .filter(index => index !== keep && this.isEvictable(index))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    for (const candidate of candidates) {
      if (this.indexes.size <= this.maxLoadedSites) break
      this.indexes.delete(candidate.siteId)
    }
  }

  // ---------------------------------------------------------------------------
  // Internals: persistence
  // ---------------------------------------------------------------------------

  private markDirty(index: LoadedSiteIndex) {
    index.dirty = true
    if (index.flushTimer || this.closed) return
    const delay = Math.min(this.flushDelayMs * 2 ** Math.min(index.flushFailures, 5), 60_000)
    index.flushTimer = setTimeout(() => {
      index.flushTimer = undefined
      void this.flushSite(index)
    }, delay)
  }

  private flushSite(index: LoadedSiteIndex): Promise<void> {
    if (index.flushTimer) {
      clearTimeout(index.flushTimer)
      index.flushTimer = undefined
    }
    if (!index.dirty) return index.flushChain
    index.flushChain = index.flushChain
      .then(() => this.writeSnapshot(index))
      .then(
        () => {
          index.flushFailures = 0
        },
        error => {
          index.flushFailures += 1
          this.logger.error('Unable to persist site search index', {
            siteId: index.siteId,
            attempt: index.flushFailures,
            error: errorMessage(error),
          })
          if (!this.closed && (this.indexes.get(index.siteId) === index || this.loading.has(index.siteId))) this.markDirty(index)
        },
      )
    return index.flushChain
  }

  private async writeSnapshot(index: LoadedSiteIndex) {
    index.flushing += 1
    try {
      // Snapshot synchronously so concurrent mutations after this point re-mark the index dirty.
      index.dirty = false
      const payload = JSON.stringify(this.serialize(index))
      const dir = this.siteDir(index.siteId)
      await fs.mkdir(dir, { recursive: true })
      const finalPath = path.join(dir, INDEX_FILE_NAME)
      const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`
      try {
        await fs.writeFile(tempPath, payload, 'utf8')
        await fs.rename(tempPath, finalPath)
      } catch (error) {
        await fs.rm(tempPath, { force: true }).catch(() => undefined)
        throw error
      }
    } catch (error) {
      index.dirty = true
      throw error
    } finally {
      index.flushing -= 1
    }
  }

  private serialize(index: LoadedSiteIndex): PersistedSiteIndex {
    return {
      format: SEARCH_INDEX_FORMAT_VERSION,
      siteId: index.siteId,
      savedAt: new Date().toISOString(),
      watermark: index.watermark,
      documents: [...index.documents.values()],
      index: index.mini.toJSON(),
    }
  }

  private deserialize(siteId: string, raw: string): PersistedSiteIndex {
    const parsed = JSON.parse(raw) as Partial<PersistedSiteIndex>
    if (!parsed || typeof parsed !== 'object') throw new Error('Index payload is not an object')
    if (parsed.format !== SEARCH_INDEX_FORMAT_VERSION) {
      throw new Error(`Unsupported index format ${String(parsed.format)} (expected ${SEARCH_INDEX_FORMAT_VERSION})`)
    }
    if (String(parsed.siteId) !== String(siteId)) throw new Error('Index belongs to a different site')
    if (!Array.isArray(parsed.documents) || !parsed.index || typeof parsed.index !== 'object') {
      throw new Error('Index payload is incomplete')
    }
    return {
      format: parsed.format,
      siteId: String(parsed.siteId),
      savedAt: String(parsed.savedAt ?? ''),
      watermark: String(parsed.watermark ?? ''),
      documents: parsed.documents as SearchDocument[],
      index: parsed.index,
    }
  }

  private miniOptions() {
    return {
      fields: [...config.search.fields],
      storeFields: [] as string[],
      tokenize: tokenizeSearchText,
    }
  }

  private createMiniSearch() {
    return new MiniSearch<SearchDocument & { text: string }>(this.miniOptions())
  }

  private siteDir(siteId: string) {
    return path.join(this.input.root, 'sites', String(siteId))
  }

  private async hasPersistedIndex(siteId: string) {
    return fs
      .access(path.join(this.siteDir(siteId), INDEX_FILE_NAME))
      .then(() => true)
      .catch(() => false)
  }

  private requireSource(): SearchIndexSource {
    if (!this.input.source) throw new Error('Search index source is not configured')
    return this.input.source
  }

  private assertOpen() {
    if (this.closed) throw new Error('Search index manager is closed')
  }

  // ---------------------------------------------------------------------------
  // Internals: text
  // ---------------------------------------------------------------------------

  private async getSearchText(
    file: Pick<SearchIndexFile, 'id' | 'siteId' | 'name' | 'key' | 'contentType' | 'extractedText' | 'extractedTextKey'>,
  ): Promise<{ text: string; truncated: boolean }> {
    if (typeof file.extractedText === 'string' && file.extractedText.trim()) {
      return truncateText(file.extractedText, this.maxTextBytes)
    }
    const key = file.extractedTextKey
      ? String(file.extractedTextKey)
      : isTextBasedContent(file.contentType, file.name)
        ? String(file.key ?? '')
        : ''
    if (!key) return { text: '', truncated: false }
    try {
      return await this.readBoundedText(key)
    } catch (error) {
      this.logger.warn('Unable to read text for indexing; indexing metadata only', {
        siteId: file.siteId,
        contentId: file.id,
        key,
        error: errorMessage(error),
      })
      return { text: '', truncated: false }
    }
  }

  private async readBoundedText(key: string): Promise<{ text: string; truncated: boolean }> {
    const storage = this.input.storage
    if (typeof storage.readObjectPrefix === 'function') {
      const { body, truncated } = await storage.readObjectPrefix({ key, maxBytes: this.maxTextBytes })
      return { text: body.toString('utf8'), truncated }
    }
    const body = await storage.readObject({ key })
    return {
      text: body.subarray(0, this.maxTextBytes).toString('utf8'),
      truncated: body.length > this.maxTextBytes,
    }
  }
}

export function createSiteSearchIndexManager(input: SiteSearchIndexManagerOptions) {
  return new SiteSearchIndexManager(input)
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function toSearchDocument(file: SearchIndexFile, text: { text: string; truncated: boolean }): SearchDocument & { text: string } {
  const metadata = file.metadata && typeof file.metadata === 'object' && !Array.isArray(file.metadata) ? file.metadata : {}
  return {
    id: String(file.id),
    siteId: String(file.siteId),
    siteName: String(file.siteName ?? ''),
    folderId: String(file.folderId ?? ''),
    folderName: String(file.folderName ?? ''),
    name: String(file.name ?? ''),
    key: String(file.key ?? ''),
    contentType: String(file.contentType ?? ''),
    size: file.size,
    uploadedAt: serializeDate(file.uploadedAt),
    createdAt: serializeDate(file.createdAt ?? file.uploadedAt),
    updatedAt: serializeDate(file.updatedAt ?? file.uploadedAt),
    tags: normalizeStringList(file.tags),
    siteTags: normalizeStringList(file.siteTags),
    metadata,
    extractedTextKey: String(file.extractedTextKey ?? ''),
    extractionStatus: file.extractionStatus,
    textAvailable: Boolean(text.text.trim()),
    textTruncated: text.truncated,
    text: text.text,
  }
}

/** True when the stored document already reflects the source record (used to skip redundant re-indexing). */
function isUnchanged(existing: SearchDocument | undefined, file: SearchIndexFile): boolean {
  if (!existing) return false
  return (
    existing.updatedAt === serializeDate(file.updatedAt ?? file.uploadedAt) &&
    existing.name === String(file.name ?? '') &&
    existing.key === String(file.key ?? '') &&
    existing.extractedTextKey === String(file.extractedTextKey ?? '') &&
    existing.extractionStatus === file.extractionStatus &&
    existing.folderId === String(file.folderId ?? '')
  )
}

function toSearchHit(doc: SearchDocument, score: number, snippet: string): SearchHit {
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
    textAvailable: doc.textAvailable,
    score,
    snippet,
  }
}

/**
 * Splits text into terms on any non letter/number character, so punctuation and symbols
 * (`$235.9`, `annual_report`, `covid-19`) never glue onto terms. Used for both indexing and
 * querying so the two always agree.
 */
export function tokenizeSearchText(text: string): string[] {
  return String(text ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

const SNIPPET_BEFORE = 120
const SNIPPET_AFTER = 200
const SNIPPET_MAX_FRAGMENTS = 3
const SNIPPET_FALLBACK_LENGTH = 300

/**
 * Builds a short excerpt around the query terms. Several fragments are joined when the
 * terms occur far apart so every matched term is represented where possible.
 */
export function createSnippet(text: string, query: string): string {
  const cleanText = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!cleanText) return ''
  const lowerText = cleanText.toLowerCase()
  const terms = [...new Set(normalizeSearchText(query).split(' ').filter(term => term.length > 1))]
  const positions = terms
    .map(term => lowerText.indexOf(term))
    .filter(position => position >= 0)
    .sort((a, b) => a - b)

  if (positions.length === 0) {
    const fallback = cleanText.slice(0, SNIPPET_FALLBACK_LENGTH)
    return cleanText.length > SNIPPET_FALLBACK_LENGTH ? `${fallback}...` : fallback
  }

  const windows: Array<[number, number]> = []
  for (const position of positions) {
    const start = Math.max(0, position - SNIPPET_BEFORE)
    const end = Math.min(cleanText.length, position + SNIPPET_AFTER)
    const last = windows[windows.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else windows.push([start, end])
    if (windows.length >= SNIPPET_MAX_FRAGMENTS) break
  }

  return windows
    .map(([start, end]) => {
      const prefix = start > 0 ? '...' : ''
      const suffix = end < cleanText.length ? '...' : ''
      return `${prefix}${cleanText.slice(start, end)}${suffix}`
    })
    .join(' ')
}

function truncateText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(text, 'utf8')
  if (buffer.length <= maxBytes) return { text, truncated: false }
  return { text: buffer.subarray(0, maxBytes).toString('utf8'), truncated: true }
}

function normalizeLimit(limit?: number) {
  return Math.max(1, Math.min(limit ?? 50, 200))
}

function serializeDate(value: unknown): string | undefined {
  if (!value) return undefined
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item ?? '').trim()).filter(Boolean)
}

function compareDesc(a?: string, b?: string) {
  return String(b ?? '').localeCompare(String(a ?? ''))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
