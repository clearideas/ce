/**
 * Notification schedule shape and its canonical form.
 *
 * `Schedule.vue` shows different fields per frequency and keeps the value consistent with them (e.g.
 * a daily schedule has no days). The form that owns the schedule must snapshot the *same* canonical
 * value, or merely opening the page marks it "Unsaved changes" — so both use `normalizeSchedule`.
 */
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
export type ScheduleFrequency = 'immediate' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never'

export interface NotificationSchedule {
  frequency: ScheduleFrequency
  hours: [string, string]
  days: DayOfWeek[]
  daysOfMonth?: number[]
  daysOfMonthExpression?: string[]
}

export const DEFAULT_MONTHLY_EXPRESSION = '1st Monday'

export function normalizeSchedule(input: NotificationSchedule): NotificationSchedule {
  const base: NotificationSchedule = {
    ...input,
    hours: [...input.hours] as [string, string],
    days: Array.isArray(input.days) ? [...input.days] : [],
  }
  switch (input.frequency) {
    case 'daily':
      return { ...base, days: [], daysOfMonth: [], daysOfMonthExpression: [] }
    case 'weekly':
      return {
        ...base,
        days: base.days.length > 0 ? base.days : ['Monday'],
        daysOfMonth: [],
        daysOfMonthExpression: [],
      }
    case 'monthly':
      if ((input.daysOfMonth?.length ?? 0) > 0)
        return { ...base, daysOfMonth: [...input.daysOfMonth!], daysOfMonthExpression: [] }
      return {
        ...base,
        daysOfMonth: [],
        // Keep a saved rule ("2nd Tuesday"); only an empty one gets the default.
        daysOfMonthExpression: input.daysOfMonthExpression?.length
          ? [...input.daysOfMonthExpression]
          : [DEFAULT_MONTHLY_EXPRESSION],
      }
    case 'immediate':
    case 'hourly':
      return { ...base, days: Array.isArray(input.days) ? base.days : ['Monday'] }
    default:
      return base
  }
}
