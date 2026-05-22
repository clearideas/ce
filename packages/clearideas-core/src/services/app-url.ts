export function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

export function trimLeadingSlashes(value: string): string {
  let start = 0
  while (start < value.length && value[start] === '/') start += 1
  return value.slice(start)
}

export function buildAppUrl(input: { baseUrl: string; path: string }): string {
  return `${trimTrailingSlashes(input.baseUrl)}/${trimLeadingSlashes(input.path)}`
}

export function buildLoginUrl(input: { baseUrl: string; email: string; siteId?: string; code?: string }): string {
  const url = new URL(buildAppUrl({ baseUrl: input.baseUrl, path: '/login' }))
  url.searchParams.set('email', input.email)
  if (input.siteId) url.searchParams.set('siteId', input.siteId)
  if (input.code) url.searchParams.set('code', input.code)
  return url.toString()
}

export function encodeHeaderFilename(value: string): string {
  return value.replace(/["\r\n]/g, '_')
}

export function encodeFilenameForHeader(filename: string): string {
  const asciiFallback = String(filename)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\\r\n]/g, '_')
  const encodedFilename = encodeURIComponent(String(filename))
  return `filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
}

export function encodeContentDisposition(filename: string, attachment = true): string {
  return `${attachment ? 'attachment; ' : ''}${encodeFilenameForHeader(filename)}`
}
