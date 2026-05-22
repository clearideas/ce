export function formatBytes(bytes?: number | null) {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`
}

export function formatRelativeDate(value?: string | Date | null) {
  if (!value) return ''
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  const absSeconds = Math.abs(diffSeconds)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, seconds] of units) {
    if (absSeconds >= seconds) return formatter.format(Math.round(diffSeconds / seconds), unit)
  }
  return 'just now'
}

export function contentTypeIconName(contentType?: string | null) {
  const type = String(contentType ?? '').toLowerCase()
  if (!type) return 'fa-file'
  if (type.includes('pdf')) return 'fa-file-pdf'
  if (type.startsWith('image/')) {
    if (type.includes('jpeg') || type.includes('jpg')) return 'fa-file-image'
    if (type.includes('png')) return 'fa-file-image'
    if (type.includes('gif')) return 'fa-file-image'
    return 'fa-file-image'
  }
  if (type.startsWith('audio/')) return 'fa-file-audio'
  if (type.startsWith('video/')) return 'fa-file-video'
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return 'fa-file-zipper'
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'fa-file-excel'
  if (type.includes('powerpoint') || type.includes('presentation') || type.includes('presentationml') || type.includes('slideshow') || type.includes('keynote')) return 'fa-file-powerpoint'
  if (type.includes('word') || type.includes('wordprocessingml') || type.includes('document')) return 'fa-file-word'
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml') || type.includes('yaml')) return 'fa-file-lines'
  if (type.includes('javascript') || type.includes('typescript') || type.includes('css') || type.includes('html')) return 'fa-file-code'
  return 'fa-file'
}

export function fileIcon(contentType?: string | null) {
  return `fasl ${contentTypeIconName(contentType)}`
}
