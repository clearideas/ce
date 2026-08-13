import type { AgentScheduleDefinition } from '@clearideas/contracts-core'
import { BadRequestError } from '@clearideas/core/errors'
import { DateTime } from 'luxon'

export function calculateNextAgentRunAt(
  definition: AgentScheduleDefinition,
  after: Date = new Date(),
): Date | null {
  const zone = DateTime.local().setZone(definition.timeZone)
  if (!zone.isValid) throw new BadRequestError(`Unknown time zone: ${definition.timeZone}`)
  const cursor = DateTime.fromJSDate(after, { zone: definition.timeZone })

  if (definition.kind === 'once') {
    const runAt = DateTime.fromISO(definition.runAt, { setZone: true })
    if (!runAt.isValid) throw new BadRequestError('The scheduled date is invalid.')
    return runAt.toMillis() > cursor.toMillis() ? runAt.toJSDate() : null
  }

  const [hour, minute] = definition.time.split(':').map(Number)
  for (let offset = 0; offset <= 400; offset += 1) {
    const day = cursor.startOf('day').plus({ days: offset })
    if (definition.kind === 'weekly' && !definition.daysOfWeek.includes(day.weekday)) continue
    if (definition.kind === 'monthly' && !definition.daysOfMonth.includes(day.day)) continue
    const candidate = day.set({ hour, minute, second: 0, millisecond: 0 })
    if (candidate.isValid && candidate.toMillis() > cursor.toMillis()) return candidate.toJSDate()
  }
  throw new BadRequestError('The schedule does not produce a date in the supported range.')
}

export function assertScheduleCanStart(definition: AgentScheduleDefinition, now = new Date()) {
  if (definition.kind === 'once') {
    const runAt = DateTime.fromISO(definition.runAt, { setZone: true })
    if (!runAt.isValid || runAt.toMillis() <= now.getTime()) {
      throw new BadRequestError('A one-time schedule must be in the future.')
    }
  }
  return calculateNextAgentRunAt(definition, now)
}
