import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import Schedule from '../../src-web/src/components/settings/Schedule.vue'
import { useDirtyForm } from '../../src-web/src/composables/useDirtyForm'
import { normalizeSchedule, type NotificationSchedule } from '../../src-web/src/utils/schedule'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

/**
 * The notification schedule's canonical form. Opening Notification settings used to show "Unsaved
 * changes" (the editor normalised the value after the form had snapshotted it), and a saved monthly
 * rule ("2nd Tuesday") was rewritten to the default on mount.
 */
const base: NotificationSchedule = { frequency: 'daily', hours: ['09:00', '17:00'], days: [] }

describe('normalizeSchedule', () => {
  it.each([
    [
      'daily drops days',
      { ...base, days: ['Monday'] },
      { days: [], daysOfMonth: [], daysOfMonthExpression: [] },
    ],
    ['weekly defaults to Monday', { ...base, frequency: 'weekly' }, { days: ['Monday'], daysOfMonth: [] }],
    ['weekly keeps chosen days', { ...base, frequency: 'weekly', days: ['Friday'] }, { days: ['Friday'] }],
    [
      'monthly keeps a saved rule',
      { ...base, frequency: 'monthly', daysOfMonthExpression: ['2nd Tuesday'] },
      { daysOfMonth: [], daysOfMonthExpression: ['2nd Tuesday'] },
    ],
    [
      'monthly defaults an empty rule',
      { ...base, frequency: 'monthly' },
      { daysOfMonthExpression: ['1st Monday'] },
    ],
    [
      'monthly specific days win over a rule',
      { ...base, frequency: 'monthly', daysOfMonth: [1, 15], daysOfMonthExpression: ['1st Monday'] },
      { daysOfMonth: [1, 15], daysOfMonthExpression: [] },
    ],
  ] as const)('%s', (_name, input, expected) => {
    expect(normalizeSchedule(input as NotificationSchedule)).toMatchObject(expected)
  })

  it('is idempotent and does not share arrays with its input', () => {
    const input: NotificationSchedule = { ...base, frequency: 'weekly', days: ['Friday'] }
    const once = normalizeSchedule(input)
    expect(normalizeSchedule(once)).toEqual(once)
    once.hours[0] = '07:00'
    expect(input.hours[0]).toBe('09:00')
  })
})

describe('useDirtyForm', () => {
  it('ignores key order', () => {
    const value = ref<Record<string, unknown>>({ a: 1, b: [1, 2] })
    const { dirty } = useDirtyForm(() => value.value)
    value.value = { b: [1, 2], a: 1 }
    expect(dirty.value).toBe(false)
    value.value = { b: [2, 1], a: 1 }
    expect(dirty.value).toBe(true)
  })
})

describe('Schedule editor', () => {
  it('does not rewrite a saved monthly rule when it mounts, and labels its fields', async () => {
    const model = ref<NotificationSchedule>({
      frequency: 'monthly',
      hours: ['08:00', '17:00'],
      days: [],
      daysOfMonth: [],
      daysOfMonthExpression: ['2nd Tuesday'],
    })
    const Host = defineComponent({
      render: () =>
        h(Schedule, {
          title: 'Reports',
          modelValue: model.value,
          'onUpdate:modelValue': (value: NotificationSchedule) => (model.value = value),
        }),
    })
    const wrapper = await mountWithVuetify(Host)
    await settle()
    expect(model.value.daysOfMonthExpression).toEqual(['2nd Tuesday'])
    expect((wrapper.find('input[value="2nd"]').element as HTMLInputElement | undefined)?.value).toBe('2nd')
    await expectNoA11yViolations(wrapper)
  })
})
