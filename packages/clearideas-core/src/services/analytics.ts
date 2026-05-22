import { DateTime } from 'luxon'
import { Types } from 'mongoose'

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export function normalizeTimeZone(value: unknown, fallback = 'UTC'): string {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback
  return DateTime.local().setZone(candidate).isValid ? candidate : fallback
}

export function parseAnalyticsDate(value: unknown, options: { timeZone: string; endOfDay?: boolean }): Date | undefined {
  if (!value) return undefined
  const date = DateTime.fromISO(String(value), { zone: options.timeZone })
  if (!date.isValid) return undefined
  return (options.endOfDay ? date.endOf('day') : date.startOf('day')).toUTC().toJSDate()
}

export function daysAgoStart(days: number, timeZone: string): Date {
  return DateTime.now().setZone(timeZone).minus({ days }).startOf('day').toUTC().toJSDate()
}

export function clampLimit(value: unknown, fallback: number, options: { min?: number; max?: number } = {}): number {
  const min = options.min ?? 1
  const max = options.max ?? 100
  const limit = Number(value ?? fallback)
  if (!Number.isFinite(limit)) return fallback
  return Math.max(min, Math.min(max, Math.floor(limit)))
}

export function castSiteQueryIds(query: Record<string, unknown>): Record<string, unknown> {
  const next: any = { ...query }
  if (typeof next.owner === 'string' && Types.ObjectId.isValid(next.owner)) {
    next.owner = new Types.ObjectId(next.owner)
  }
  if (next._id && typeof next._id === 'object') {
    next._id = { ...(next._id as Record<string, unknown>) }
    if (Array.isArray(next._id.$in)) {
      next._id.$in = next._id.$in
        .filter((id: unknown) => Types.ObjectId.isValid(String(id)))
        .map((id: unknown) => new Types.ObjectId(String(id)))
    }
    if (Array.isArray(next._id.$nin)) {
      next._id.$nin = next._id.$nin
        .filter((id: unknown) => Types.ObjectId.isValid(String(id)))
        .map((id: unknown) => new Types.ObjectId(String(id)))
    }
  }
  if (Array.isArray(next.$or)) {
    next.$or = next.$or.map((condition: any) => {
      const copy = { ...condition }
      if (typeof copy.owner === 'string' && Types.ObjectId.isValid(copy.owner)) {
        copy.owner = new Types.ObjectId(copy.owner)
      }
      const userId = copy.members?.$elemMatch?.user
      if (typeof userId === 'string' && Types.ObjectId.isValid(userId)) {
        copy.members = {
          ...copy.members,
          $elemMatch: {
            ...copy.members.$elemMatch,
            user: new Types.ObjectId(userId),
          },
        }
      }
      return copy
    })
  }
  return next
}

export function humanizeAction(action: string): string {
  return action
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
