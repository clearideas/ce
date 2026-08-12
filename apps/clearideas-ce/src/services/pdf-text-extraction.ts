import type { CoreModels } from '@clearideas/core/models'
import type { StorageProvider } from '@clearideas/core/providers'
import { config } from '../config/index.js'

type ExtractionStatus = typeof config.content.extractionStatus[keyof typeof config.content.extractionStatus]

interface PdfExtractionInput {
  models: CoreModels
  storage: StorageProvider
  search?: {
    indexFile(file: any): Promise<void>
  }
  fileKey: string
  contentType?: string
}

export function queuePdfTextExtraction(input: PdfExtractionInput) {
  if (!isPdf(input.contentType, input.fileKey)) return

  void extractPdfTextForFile(input).catch(error => {
    console.warn(`PDF text extraction failed for ${input.fileKey}:`, error)
  })
}

export async function extractPdfTextForFile(input: PdfExtractionInput) {
  if (!isPdf(input.contentType, input.fileKey)) return null
  try {
    const body = await input.storage.readObject({ key: input.fileKey })
    const extractedText = await extractTextFromPdfBuffer(body)
    const trimmed = extractedText.trim()
    const status: ExtractionStatus = trimmed ? config.content.extractionStatus.complete : config.content.extractionStatus.unsupported
    const extractedTextKey = `${input.fileKey}.extracted.txt`
    if (trimmed) {
      await input.storage.writeObject({
        key: extractedTextKey,
        body: Buffer.from(trimmed, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      })
    }
    const updatedFile = await updateFileExtraction({
      models: input.models,
      fileKey: input.fileKey,
      extractionStatus: status,
      extractedText: trimmed,
      extractedTextKey: trimmed ? extractedTextKey : '',
    })
    if (updatedFile && input.search) await input.search.indexFile(updatedFile).catch(() => undefined)
    return updatedFile
  } catch (error) {
    await updateFileExtraction({
      models: input.models,
      fileKey: input.fileKey,
      extractionStatus: 'failed',
      extractedText: '',
    }).catch(() => undefined)
    throw error
  }
}

async function extractTextFromPdfBuffer(buffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
  } as any)
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
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
    await loadingTask.destroy()
  }

  return pages.join('\n\n')
}

function isPdf(contentType: unknown, fileKey: string) {
  return String(contentType ?? '').toLowerCase().split(';')[0].trim() === 'application/pdf' ||
    fileKey.toLowerCase().endsWith('.pdf')
}

async function updateFileExtraction(input: {
  models: CoreModels
  fileKey: string
  extractedText?: string
  extractedTextKey?: string
  extractionStatus: ExtractionStatus
}) {
  const set = buildExtractionSet(input)
  const nestedFile = await input.models.ContentModel.findOneAndUpdate(
    { key: input.fileKey, kind: 'File' },
    { $set: set },
    { returnDocument: 'after' },
  ).lean()
  if (!nestedFile) return null
  const [site, folder] = await Promise.all([
    input.models.SiteModel.findById(nestedFile.site).select('_id name').lean(),
    nestedFile.parentType === 'Content'
      ? input.models.ContentModel.findById(nestedFile.parent).select('_id name').lean()
      : null,
  ])
  if (!site) return null

  return {
    id: String(nestedFile._id),
    siteId: String(site._id),
    siteName: site.name,
    folderId: folder ? String(folder._id) : '',
    folderName: folder ? String(folder.name ?? '') : '',
    name: nestedFile.name,
    key: nestedFile.key,
    contentType: nestedFile.contentType,
    size: nestedFile.size,
    uploadedAt: nestedFile.uploadedAt,
    updatedAt: (nestedFile as any).updatedAt ?? nestedFile.uploadedAt,
    extractedText: nestedFile.extractedText,
    extractedTextKey: nestedFile.extractedTextKey,
    extractionStatus: nestedFile.extractionStatus,
  }
}

function buildExtractionSet(input: {
  extractedText?: string
  extractedTextKey?: string
  extractionStatus: ExtractionStatus
}) {
  const set: Record<string, unknown> = {
    extractionStatus: input.extractionStatus,
    extractedTextUpdatedAt: new Date(),
  }
  if (input.extractedText !== undefined) set.extractedText = input.extractedText
  if (input.extractedTextKey !== undefined) set.extractedTextKey = input.extractedTextKey
  return set
}
