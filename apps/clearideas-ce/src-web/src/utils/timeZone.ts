export interface TimeZone {
  title: string
  value: string
  offset: string
}

export function getTimeZoneWithOffset(tz: string): TimeZone {
  const date = new Date()
  const options: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }
  const formatter = new Intl.DateTimeFormat([], options)
  const parts = formatter.formatToParts(date)
  let offset = parts.find(part => part.type === 'timeZoneName')?.value || ''

  if (!offset) {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }))
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000
    const offsetHours = offsetMinutes / 60
    const sign = offsetHours >= 0 ? '+' : '-'
    const absOffsetHours = Math.floor(Math.abs(offsetHours))
    const absOffsetMinutes = Math.abs(offsetMinutes) % 60

    offset = `UTC${sign}${String(absOffsetHours).padStart(2, '0')}:${String(absOffsetMinutes).padStart(2, '0')}`
  }

  return {
    title: `${tz} (${offset})`,
    value: tz,
    offset,
  }
}
