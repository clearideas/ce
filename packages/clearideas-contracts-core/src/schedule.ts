import { z } from 'zod'

export const SCHEDULE_FREQUENCY_OPTIONS = [
  'immediate',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'never',
] as const

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCY_OPTIONS)[number]

export const DAY_OF_WEEK_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export type DayOfWeek = (typeof DAY_OF_WEEK_OPTIONS)[number]

export const MONTH_ORDINAL_OPTIONS = ['1st', '2nd', '3rd', '4th', '5th', 'last'] as const

export type MonthOrdinal = (typeof MONTH_ORDINAL_OPTIONS)[number]

const DAY_OF_WEEK_BY_NORMALIZED_VALUE = DAY_OF_WEEK_OPTIONS.reduce<Record<string, DayOfWeek>>(
  (acc, day) => {
    acc[day.toLowerCase()] = day
    return acc
  },
  {},
)

const MONTH_ORDINAL_BY_NORMALIZED_VALUE = MONTH_ORDINAL_OPTIONS.reduce<
  Record<string, MonthOrdinal>
>(
  (acc, ordinal) => {
    acc[ordinal.toLowerCase()] = ordinal
    return acc
  },
  {
    first: '1st',
    second: '2nd',
    third: '3rd',
    fourth: '4th',
    fifth: '5th',
  },
)

export const ScheduleFrequencySchema = z.enum(SCHEDULE_FREQUENCY_OPTIONS)
export const ScheduleStatusSchema = z.enum(['active', 'inactive'])
export const ValidTimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)

export const DayOfWeekSchema = z.string().transform((value, ctx) => {
  const normalized = value.trim().toLowerCase()
  const day = DAY_OF_WEEK_BY_NORMALIZED_VALUE[normalized]
  if (!day) {
    ctx.addIssue({ code: 'custom', message: 'Invalid day of week' })
    return z.NEVER
  }
  return day
})

export const DayOfMonthExpressionSchema = z.string().transform((value, ctx) => {
  const [ordinalRaw, ...dayParts] = value.trim().split(/\s+/)
  const ordinal = MONTH_ORDINAL_BY_NORMALIZED_VALUE[ordinalRaw?.toLowerCase()]
  const dayOfWeek = DAY_OF_WEEK_BY_NORMALIZED_VALUE[dayParts.join(' ').toLowerCase()]
  if (!ordinal || !dayOfWeek) {
    ctx.addIssue({ code: 'custom', message: 'Invalid day-of-month expression' })
    return z.NEVER
  }

  return `${ordinal} ${dayOfWeek}`
})
