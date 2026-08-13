import { describe, expect, it } from 'vitest'
import { assertScheduleCanStart, calculateNextAgentRunAt } from '../../src/services/agent/schedule.js'

describe('agent schedule calculation', () => {
  it('calculates daily and weekly times in the selected time zone', () => {
    expect(
      calculateNextAgentRunAt(
        { kind: 'daily', time: '09:30', timeZone: 'America/Toronto' },
        new Date('2026-08-13T12:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-08-13T13:30:00.000Z')
    expect(
      calculateNextAgentRunAt(
        { kind: 'weekly', time: '10:00', timeZone: 'UTC', daysOfWeek: [1] },
        new Date('2026-08-13T12:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-08-17T10:00:00.000Z')
  })

  it('skips invalid monthly days and rejects past one-time schedules', () => {
    expect(
      calculateNextAgentRunAt(
        { kind: 'monthly', time: '08:00', timeZone: 'UTC', daysOfMonth: [31] },
        new Date('2026-04-30T12:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-05-31T08:00:00.000Z')
    expect(() =>
      assertScheduleCanStart(
        { kind: 'once', runAt: '2026-01-01T00:00:00.000Z', timeZone: 'UTC' },
        new Date('2026-08-13T00:00:00.000Z'),
      ),
    ).toThrow(/future/i)
  })
})
