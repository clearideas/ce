/**
 * Seed data for UI specs through the public CE API (the signed-in page's request context).
 * Keep seeding here so every spec builds the same shapes the UI expects.
 */
import { expect, type Page } from '@playwright/test'

export async function apiCall<T = Record<string, unknown>>(
  page: Page,
  baseURL: string,
  route: string,
  input: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await page.request.fetch(`${baseURL}${route}`, {
    method: input.method ?? 'GET',
    data: input.body,
    headers: input.body ? { 'content-type': 'application/json' } : undefined,
  })
  expect(response.ok(), `${input.method ?? 'GET'} ${route}: ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

export async function createSite(page: Page, baseURL: string, name: string) {
  const { site } = await apiCall<{ site: { id: string } }>(page, baseURL, '/api/sites', {
    method: 'POST',
    body: { name },
  })
  return site.id
}

export async function createFolder(
  page: Page,
  baseURL: string,
  siteId: string,
  name: string,
  folderId?: string,
) {
  const { folder } = await apiCall<{ folder: { id: string } }>(
    page,
    baseURL,
    `/api/sites/${siteId}/folders`,
    {
      method: 'POST',
      body: { name, ...(folderId ? { folderId } : {}) },
    },
  )
  return folder.id
}

export async function uploadFile(
  page: Page,
  baseURL: string,
  input: { siteId: string; folderId?: string; name: string; contentType: string; body: Buffer },
) {
  const { target } = await apiCall<{
    target: { url: string; fileId: string; headers?: Record<string, string> }
  }>(page, baseURL, '/api/files/upload-target', {
    method: 'POST',
    body: {
      siteId: input.siteId,
      ...(input.folderId ? { folderId: input.folderId } : {}),
      fileName: input.name,
      contentType: input.contentType,
      size: input.body.byteLength,
    },
  })
  const upload = await page.request.put(`${baseURL}${target.url}`, {
    data: input.body,
    headers: { 'content-type': input.contentType, ...(target.headers ?? {}) },
  })
  expect(upload.ok(), `upload ${input.name}`).toBe(true)
  return target.fileId
}

/**
 * A minimal, valid PDF with `pages` pages (each says "Page N"). Built with correct xref offsets so
 * pdf.js opens it without repair; used by the file-viewer journey.
 */
export function multiPagePdf(pages = 2): Buffer {
  return writePdf(
    Array.from({ length: pages }, (_, index) => `BT /F1 36 Tf 72 720 Td (Page ${index + 1}) Tj ET`),
  )
}

/**
 * A text document: per page a heading and paragraphs (Helvetica; lines are wrapped at ~90
 * characters). Used for screenshots, where "Page 1" would not show what the viewer is for.
 */
export function documentPdf(pages: { heading: string; paragraphs: string[] }[]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, match => `\\${match}`)
  const wrap = (text: string) => {
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      if (`${line} ${word}`.trim().length > 90) {
        lines.push(line)
        line = word
      } else line = `${line} ${word}`.trim()
    }
    if (line) lines.push(line)
    return lines
  }
  return writePdf(
    pages.map(({ heading, paragraphs }) => {
      const body = paragraphs
        .flatMap((paragraph, index) => [...(index > 0 ? [''] : []), ...wrap(paragraph)])
        .map(line => `(${escape(line)}) Tj T*`)
        .join(' ')
      return `BT /F2 22 Tf 72 710 Td (${escape(heading)}) Tj ET BT /F1 12 Tf 16 TL 72 670 Td ${body} ET`
    }),
  )
}

function writePdf(pageStreams: string[]): Buffer {
  const objects: string[] = []
  const pageIds = pageStreams.map((_, index) => 3 + index * 2)
  const fontId = 3 + pageStreams.length * 2
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`
  pageIds.forEach((id, index) => {
    const stream = pageStreams[index]!
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${id + 1} 0 R ` +
      `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontId + 1} 0 R >> >> >>`
    objects[id + 1] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  })
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  objects[fontId + 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}
