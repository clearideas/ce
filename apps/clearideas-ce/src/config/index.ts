import { coreArchiveExtraction, coreContentStatus, coreExtractionStatus, coreRole, coreSiteRoles, coreSiteStatus, coreSiteVisibility } from '@clearideas/core'
import type { NotificationActionTypeRegistry } from '@clearideas/core'

function numberFromEnv(name: string, fallback: number, options: { min?: number } = {}) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  if (options.min != null && value < options.min) return fallback
  return value
}

function booleanFromEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw == null || raw === '') return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

function stringFromEnv(name: string, fallbackNames: string[] = [], options: { devFallback?: string } = {}) {
  const names = [name, ...fallbackNames]
  for (const candidate of names) {
    const value = process.env[candidate]?.trim()
    if (value) return value
  }

  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction) {
    throw new Error(`${name} is required in production${fallbackNames.length ? `; fallback keys checked: ${fallbackNames.join(', ')}` : ''}`)
  }
  return options.devFallback ?? 'dev-only-secret-change-me'
}

export const config = {
  site: {
    roles: coreSiteRoles,
    role: coreRole,
    visibility: coreSiteVisibility,
    status: coreSiteStatus,
    publicVisibility: coreSiteVisibility.public,
    privateVisibility: coreSiteVisibility.private,
    activeStatus: coreSiteStatus.active,
  },
  user: {
    firstUserRoles: [coreRole.owner],
    activeStatus: coreSiteStatus.active,
  },
  content: {
    status: coreContentStatus,
    extractionStatus: coreExtractionStatus,
    archiveExtraction: coreArchiveExtraction,
  },
  analytics: {
    defaultActions: ['viewed', 'file-viewed', 'file-downloaded', 'file-uploaded', 'folder-created', 'content-deleted', 'content-searched'],
    defaultLimit: 20,
    dashboardLimit: 5,
  },
  search: {
    fields: ['name', 'contentType', 'text'],
    /** Multi-term queries require every term to match (AND). */
    combineWith: 'AND' as const,
    /** Minimum term length before fuzzy matching is applied; shorter terms match exactly/prefix only. */
    fuzzyMinTermLength: 5,
    fuzzy: 0.2,
    boost: { name: 4, contentType: 2, text: 1 },
    idleMs: () => numberFromEnv('SEARCH_INDEX_IDLE_MS', 5 * 60 * 1000, { min: 10_000 }),
    maxLoadedSites: () => numberFromEnv('SEARCH_INDEX_MAX_LOADED_SITES', 25, { min: 1 }),
    /** Delay before a dirty site index is persisted; changes within the window are coalesced. */
    flushDelayMs: () => numberFromEnv('SEARCH_INDEX_FLUSH_DELAY_MS', 2_000, { min: 0 }),
    /** Maximum bytes of text indexed (and used for snippets) per document. */
    maxTextBytes: () => numberFromEnv('SEARCH_INDEX_MAX_TEXT_BYTES', 2 * 1024 * 1024, { min: 1024 }),
    /** Number of background indexing tasks processed concurrently. */
    indexConcurrency: () => numberFromEnv('SEARCH_INDEX_CONCURRENCY', 2, { min: 1 }),
  },
  extraction: {
    /** PDFs larger than this are not text-extracted (status: unsupported). */
    pdfMaxBytes: () => numberFromEnv('PDF_EXTRACTION_MAX_BYTES', 50 * 1024 * 1024, { min: 1024 }),
    /** Only the first N pages are extracted; longer PDFs are marked `limited`. */
    pdfMaxPages: () => numberFromEnv('PDF_EXTRACTION_MAX_PAGES', 500, { min: 1 }),
    /** Extraction exceeding this is aborted and marked `failed`. */
    pdfTimeoutMs: () => numberFromEnv('PDF_EXTRACTION_TIMEOUT_MS', 60_000, { min: 1_000 }),
    /** Number of PDF extractions processed concurrently. */
    pdfConcurrency: () => numberFromEnv('PDF_EXTRACTION_CONCURRENCY', 1, { min: 1 }),
    /** Minimum age of a `failed` extraction before it is retried on demand. */
    retryFailedAfterMs: () => numberFromEnv('PDF_EXTRACTION_RETRY_FAILED_AFTER_MS', 60 * 60 * 1000, { min: 0 }),
  },
  app: {
    docsEnabled: () => booleanFromEnv('CLEARIDEAS_DOCS_ENABLED', true),
  },
  notifications: {
    pollIntervalMs: () => numberFromEnv('NOTIFICATION_POLL_INTERVAL_MS', 60_000, { min: 10_000 }),
    batchSize: 100,
    maxAttempts: 5,
    claimTtlMs: 5 * 60_000,
    retryBaseDelayMs: 60_000,
    actionTypes: {
      'file-uploaded': 'uploaded',
      'folder-created': 'created',
      'site-created': 'created',
      'content-deleted': 'deleted',
      'site-deleted': 'deleted',
      'site-made-public': 'made-public',
      'site-made-private': 'made-private',
      'user-created': 'added-user',
      'user-deleted': 'removed-user',
    } satisfies NotificationActionTypeRegistry,
  },
  ai: {
    siteChatSystemPrompt: [
      'You are Clear Ideas Community Edition site chat.',
      'Answer questions using the current site when the question is about site content.',
      'Use search_content to find relevant files and retrieve_file_content to read files when the user asks for details, numbers, quotes, summaries, or comparisons from a file.',
      'Search results may include extracted text snippets; use snippets only for brief answers when they contain the needed facts.',
      'For numeric or financial answers, prefer retrieve_file_content over snippets and only report figures that appear in retrieved content or snippets.',
      'Search, list, and metadata tools return contentId for files and folders. Pass that exact contentId to retrieve_file_content.',
      'If a PDF search result has extractionStatus "complete", its text is available. Call retrieve_file_content with that result contentId before saying you cannot quote it.',
      'Do not invent figures, citations, or file contents. If the available content is insufficient, say what is missing.',
      'Keep answers concise and cite file names when you rely on retrieved content.',
    ].join(' '),
  },
  tokens: {
    fileAccessTtlSeconds: () => numberFromEnv('FILE_ACCESS_TOKEN_TTL_SECONDS', 300, { min: 30 }),
    uploadTtlMs: () => numberFromEnv('UPLOAD_TOKEN_TTL_SECONDS', 15 * 60, { min: 30 }) * 1000,
    authSecret: () => stringFromEnv('BETTER_AUTH_SECRET'),
    fileAccessSecret: () => stringFromEnv('FILE_ACCESS_TOKEN_SECRET', ['BETTER_AUTH_SECRET']),
    uploadSigningSecret: () => stringFromEnv('UPLOAD_SIGNING_SECRET', ['BETTER_AUTH_SECRET']),
  },
} as const

export default config
