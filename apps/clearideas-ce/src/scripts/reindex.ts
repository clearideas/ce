/**
 * Rebuilds site search indexes from the database and stored file text.
 *
 * Usage:
 *   npm run -w @clearideas/ce reindex            # every site
 *   npm run -w @clearideas/ce reindex -- <siteId> [<siteId> ...]
 *
 * The search index is a disposable cache; this command recreates it from the source
 * of truth. Run it after restoring data, after upgrading across an index format change,
 * or when search results look stale.
 */
import { registerCoreModels } from '@clearideas/core'
import fs from 'node:fs/promises'
import mongoose from 'mongoose'
import { createLocalStorageProvider, resolveAppPath } from '../app.js'
import { createSiteSearchIndexManager } from '../services/search-index.js'
import { createMongoSearchIndexSource } from '../services/search-index-source.js'
import { buildMongoConfigFromEnv, loadCeEnv } from './env.js'

loadCeEnv()

const requestedSiteIds = process.argv.slice(2).map(value => value.trim()).filter(Boolean)
const storageRoot = resolveAppPath(process.env.STORAGE_ROOT ?? 'data/storage')
const searchRoot = resolveAppPath(process.env.SEARCH_INDEX_ROOT ?? 'data/search')
await fs.mkdir(searchRoot, { recursive: true })

const mongo = await buildMongoConfigFromEnv()
await mongoose.connect(mongo.uri, mongo.options)
const models = registerCoreModels(mongoose)

const search = createSiteSearchIndexManager({
  root: searchRoot,
  storage: createLocalStorageProvider(storageRoot),
  source: createMongoSearchIndexSource(models),
  // Load nothing implicitly: every requested site is rebuilt explicitly below.
  autoRebuild: false,
  maxLoadedSites: 1,
})

try {
  const siteQuery = requestedSiteIds.length > 0 ? { _id: { $in: requestedSiteIds } } : {}
  const sites = await models.SiteModel.find(siteQuery).select('_id name').sort({ name: 1 }).lean()
  if (requestedSiteIds.length > 0 && sites.length !== requestedSiteIds.length) {
    const found = new Set(sites.map((site: any) => String(site._id)))
    for (const siteId of requestedSiteIds) {
      if (!found.has(siteId)) console.warn(`Site ${siteId} not found; skipping`)
    }
  }
  let totalDocuments = 0
  const startedAt = Date.now()
  for (const site of sites) {
    const siteId = String(site._id)
    const siteStartedAt = Date.now()
    const count = await search.rebuildSiteIndex(siteId)
    totalDocuments += count
    console.log(`Rebuilt ${site.name} (${siteId}): ${count} document(s) in ${Date.now() - siteStartedAt}ms`)
    search.unloadIdleIndexes()
  }
  console.log(`Reindexed ${sites.length} site(s), ${totalDocuments} document(s) in ${Date.now() - startedAt}ms`)
} finally {
  await search.close()
  await mongoose.disconnect()
}
