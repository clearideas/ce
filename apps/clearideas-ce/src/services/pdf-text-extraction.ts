import type { CoreModels } from '@clearideas/core/models'
import type { StorageProvider } from '@clearideas/core/providers'
import { config } from '../config/index.js'
import { createTaskQueue, type TaskQueue } from './task-queue.js'

type ExtractionStatus = typeof config.content.extractionStatus[keyof typeof config.content.extractionStatus]

interface SearchIndexer {
  enqueueIndexContent(siteId: string, contentId: string): void
}

interface PdfExtractionInput {
  models: CoreModels
  storage: StorageProvider
  search?: SearchIndexer
  fileKey: string
  contentType?: string
}

export interface PdfExtractionLimits {
  maxBytes: number
  maxPages: number
  timeoutMs: number
}

export interface PdfExtractionResult {
  text: string
  status: ExtractionStatus
  pages: number
  extractedPages: number
}

let extractionQueue: TaskQueue | null = null

function getExtractionQueue() {
  if (!extractionQueue) extractionQueue = createTaskQueue({ concurrency: config.extraction.pdfConcurrency() })
  return extractionQueue
}

/** Resolves when all queued extractions have finished (tests and scripts). */
export async function waitForPdfExtractions() {
  await getExtractionQueue().idle()
}

/**
 * Schedules text extraction for a PDF in the background. Extraction runs through a
 * bounded queue so many concurrent uploads cannot saturate the process.
 */
export function queuePdfTextExtraction(input: PdfExtractionInput) {
  if (!isPdf(input.contentType, input.fileKey)) return

  void extractPdfTextForFile(input).catch(error => {
    console.warn(`PDF text extraction failed for ${input.fileKey}:`, error)
  })
}

/**
 * Extracts text for a PDF, stores it as a companion object, records the outcome on the
 * content record and schedules (re)indexing. Always resolves the content's searchability:
 * even when extraction fails the file is indexed by name/metadata.
 */
export async function extractPdfTextForFile(input: PdfExtractionInput) {
  if (!isPdf(input.contentType, input.fileKey)) return null
  return getExtractionQueue().run(() => runExtraction(input))
}

async function runExtraction(input: PdfExtractionInput) {
  const limits = currentLimits()
  let updatedFile: Awaited<ReturnType<typeof updateFileExtraction>> = null
  try {
    const record = await input.models.ContentModel.findOne({ key: input.fileKey, kind: 'File' })
      .select('size')
      .lean()
    const knownSize = Number(record?.size ?? 0)
    if (knownSize > limits.maxBytes) {
      updatedFile = await updateFileExtraction({
        models: input.models,
        fileKey: input.fileKey,
        extractionStatus: config.content.extractionStatus.unsupported,
        extractedTextKey: '',
      })
      return updatedFile
    }

    const body = await input.storage.readObject({ key: input.fileKey })
    if (body.length > limits.maxBytes) {
      updatedFile = await updateFileExtraction({
        models: input.models,
        fileKey: input.fileKey,
        extractionStatus: config.content.extractionStatus.unsupported,
        extractedTextKey: '',
      })
      return updatedFile
    }

    const extraction = await extractTextFromPdfBuffer(body, limits)
    const trimmed = extraction.text.trim()
    const status: ExtractionStatus = trimmed ? extraction.status : config.content.extractionStatus.unsupported
    const extractedTextKey = `${input.fileKey}.extracted.txt`
    if (trimmed) {
      await input.storage.writeObject({
        key: extractedTextKey,
        body: Buffer.from(trimmed, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      })
    }
    updatedFile = await updateFileExtraction({
      models: input.models,
      fileKey: input.fileKey,
      extractionStatus: status,
      extractedTextKey: trimmed ? extractedTextKey : '',
    })
    return updatedFile
  } catch (error) {
    updatedFile = await updateFileExtraction({
      models: input.models,
      fileKey: input.fileKey,
      extractionStatus: config.content.extractionStatus.failed,
      extractedTextKey: '',
    }).catch(() => null)
    throw error
  } finally {
    if (updatedFile && input.search) input.search.enqueueIndexContent(updatedFile.siteId, updatedFile.id)
  }
}

/**
 * Whether an on-demand extraction attempt should be made for a PDF record.
 * Failed extractions are retried only after a cool-down to avoid re-running
 * expensive work on every request.
 */
export function shouldAttemptPdfExtraction(file: {
  extractionStatus?: unknown
  extractedTextUpdatedAt?: unknown
}, now: Date = new Date()): boolean {
  const status = String(file.extractionStatus ?? '')
  if (!status || status === config.content.extractionStatus.pending) return true
  if (status === config.content.extractionStatus.unsupported) return false
  if (status === config.content.extractionStatus.failed) {
    const updatedAt = file.extractedTextUpdatedAt ? new Date(String(file.extractedTextUpdatedAt)) : null
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return true
    return now.getTime() - updatedAt.getTime() >= config.extraction.retryFailedAfterMs()
  }
  return false
}

function currentLimits(): PdfExtractionLimits {
  return {
    maxBytes: config.extraction.pdfMaxBytes(),
    maxPages: config.extraction.pdfMaxPages(),
    timeoutMs: config.extraction.pdfTimeoutMs(),
  }
}

export async function extractTextFromPdfBuffer(buffer: Buffer, limits: PdfExtractionLimits): Promise<PdfExtractionResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
  } as any)

  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`PDF text extraction timed out after ${limits.timeoutMs}ms`)), limits.timeoutMs)
    timer.unref?.()
  })

  const work = (async () => {
    const document = await loadingTask.promise
    const pages: string[] = []
    const totalPages = document.numPages
    const pageLimit = Math.min(totalPages, limits.maxPages)
    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const text = content.items
          .map(item => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' ')
        if (text.trim()) pages.push(`Page ${pageNumber}\n${text}`)
        page.cleanup()
      }
    } finally {
      await loadingTask.destroy().catch(() => undefined)
    }
    return {
      text: pages.join('\n\n'),
      status: totalPages > pageLimit ? config.content.extractionStatus.limited : config.content.extractionStatus.complete,
      pages: totalPages,
      extractedPages: pageLimit,
    } satisfies PdfExtractionResult
  })()

  try {
    return await Promise.race([work, deadline])
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined)
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isPdf(contentType: unknown, fileKey: string) {
  return String(contentType ?? '').toLowerCase().split(';')[0].trim() === 'application/pdf' ||
    fileKey.toLowerCase().endsWith('.pdf')
}

async function updateFileExtraction(input: {
  models: CoreModels
  fileKey: string
  extractedTextKey?: string
  extractionStatus: ExtractionStatus
}) {
  // Extracted text lives in storage (companion object) and the search index only; it is
  // intentionally not written to the database record.
  const set: Record<string, unknown> = {
    extractionStatus: input.extractionStatus,
    extractedTextUpdatedAt: new Date(),
  }
  if (input.extractedTextKey !== undefined) set.extractedTextKey = input.extractedTextKey
  const update: Record<string, unknown> = { $set: set, $unset: { extractedText: '' } }
  const nestedFile = await input.models.ContentModel.findOneAndUpdate(
    { key: input.fileKey, kind: 'File' },
    update,
    { returnDocument: 'after' },
  ).lean()
  if (!nestedFile) return null
  return {
    id: String(nestedFile._id),
    siteId: String(nestedFile.site),
    key: nestedFile.key,
    extractedTextKey: nestedFile.extractedTextKey,
    extractionStatus: nestedFile.extractionStatus,
  }
}
