<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DaySelect from '../base/DaySelect.vue'
import IconCheckbox from '../base/IconCheckbox.vue'
import { getVuetifyItemRaw } from '../../utils/vuetify'

type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
type ScheduleFrequency = 'immediate' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never'

interface ScheduleFrequencyProps {
  title: string
  value: ScheduleFrequency
  subtitle: string
  prependIcon: string
}

export interface NotificationSchedule {
  frequency: ScheduleFrequency
  hours: [string, string]
  days: DayOfWeek[]
  daysOfMonth?: number[]
  daysOfMonthExpression?: string[]
}

interface Props {
  showImmediate?: boolean
  showHourly?: boolean
  showDaily?: boolean
  showWeekly?: boolean
  showMonthly?: boolean
  showNever?: boolean
  title: string
  disabled?: boolean
  compact?: boolean
}

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)
const MONTH_ORDINAL_OPTIONS = ['1st', '2nd', '3rd', '4th', '5th', 'last']
const DAY_OF_WEEK_OPTIONS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const props = withDefaults(defineProps<Props>(), {
  showImmediate: true,
  showHourly: true,
  showDaily: true,
  showWeekly: true,
  showMonthly: true,
  showNever: true,
  disabled: false,
  compact: false,
})

const schedule = defineModel<NotificationSchedule>({
  type: Object,
  default: {
    frequency: 'daily',
    hours: ['09:00', '17:00'],
    days: [],
  },
})

const ordinalExpression = ref('1st')
const daysOfWeekExpression = ref<DayOfWeek>(DAY_OF_WEEK_OPTIONS[0])
const daysOfMonthExpressionEnabled = ref(true)
const daysOfMonthExpressionDisabled = computed(() => !daysOfMonthExpressionEnabled.value)

const scheduleFrequencies = computed(() => [
  {
    title: 'Immediate',
    value: 'immediate',
    subtitle: `${props.title} are sent as events happen, within the selected hours.`,
    prependIcon: 'fasl fa-bell',
  },
  {
    title: 'Hourly',
    value: 'hourly',
    subtitle: `${props.title} are grouped hourly within the selected hours.`,
    prependIcon: 'fasl fa-clock',
  },
  {
    title: 'Daily',
    value: 'daily',
    subtitle: `${props.title} are sent once per day.`,
    prependIcon: 'fasl fa-calendar-day',
  },
  {
    title: 'Weekly',
    value: 'weekly',
    subtitle: `${props.title} are sent on the selected days.`,
    prependIcon: 'fasl fa-calendar-week',
  },
  {
    title: 'Monthly',
    value: 'monthly',
    subtitle: `${props.title} are sent monthly.`,
    prependIcon: 'fasl fa-calendar',
  },
  {
    title: 'Never',
    value: 'never',
    subtitle: `${props.title} are disabled.`,
    prependIcon: 'fasl fa-bell-slash',
  },
])

const frequencies = computed(() => [
  ...(props.showImmediate ? [scheduleFrequencies.value[0]] : []),
  ...(props.showHourly ? [scheduleFrequencies.value[1]] : []),
  ...(props.showDaily ? [scheduleFrequencies.value[2]] : []),
  ...(props.showWeekly ? [scheduleFrequencies.value[3]] : []),
  ...(props.showMonthly ? [scheduleFrequencies.value[4]] : []),
  ...(props.showNever ? [scheduleFrequencies.value[5]] : []),
])

function updateDayOfMonthExpression() {
  schedule.value = {
    ...schedule.value,
    daysOfMonthExpression: [[ordinalExpression.value, daysOfWeekExpression.value].join(' ')],
  }
}

function toggleDayOfMonthExpression(type: 'enabled' | 'disabled') {
  if (type === 'disabled') {
    schedule.value = { ...schedule.value, daysOfMonthExpression: [] }
    daysOfMonthExpressionEnabled.value = false
  } else {
    schedule.value = { ...schedule.value, daysOfMonth: [] }
    daysOfMonthExpressionEnabled.value = true
  }
}

watch(
  () => schedule.value.frequency,
  () => {
    if (schedule.value.frequency === 'monthly') {
      if (schedule.value.daysOfMonth && schedule.value.daysOfMonth.length > 0) {
        toggleDayOfMonthExpression('disabled')
      } else {
        updateDayOfMonthExpression()
      }
    }
    if (schedule.value.frequency === 'weekly') {
      schedule.value = {
        ...schedule.value,
        days: Array.isArray(schedule.value.days) && schedule.value.days.length > 0 ? schedule.value.days : ['Monday'],
        daysOfMonth: [],
        daysOfMonthExpression: [],
      }
    }
    if (schedule.value.frequency === 'daily') {
      schedule.value = { ...schedule.value, days: [], daysOfMonth: [], daysOfMonthExpression: [] }
    }
    if ((schedule.value.frequency === 'immediate' || schedule.value.frequency === 'hourly') && !Array.isArray(schedule.value.days)) {
      schedule.value.days = ['Monday']
    }
  },
  { immediate: true },
)

function getScheduleFrequency(item: unknown): ScheduleFrequencyProps {
  return getVuetifyItemRaw<ScheduleFrequencyProps>(item)
}
</script>

<template>
  <div class="schedule-control" :class="{ 'schedule-control--compact': props.compact }">
    <p class="text-body-2">{{ props.title }} will be processed according to this schedule.</p>
    <VSelect
      v-model="schedule.frequency"
      :items="frequencies"
      item-title="title"
      item-value="value"
      class="mb-4"
      max-width="500"
      label="Frequency"
      :disabled="props.disabled"
    >
      <template #selection="{ item }">
        {{ getScheduleFrequency(item).title }}
      </template>
      <template #item="{ props: slotProps, item }">
        <VListItem
          v-bind="slotProps"
          :title="getScheduleFrequency(item).title"
          :subtitle="getScheduleFrequency(item).subtitle"
          :prepend-icon="getScheduleFrequency(item).prependIcon"
        />
      </template>
    </VSelect>
    <div v-if="['hourly', 'immediate'].includes(schedule.frequency)"><p class="text-body-2">Between the following times</p></div>
    <div v-if="['daily', 'weekly', 'monthly'].includes(schedule.frequency)"><p class="text-body-2">At</p></div>
    <VTextField
      v-if="!['never'].includes(schedule.frequency)"
      v-model="schedule.hours[0]"
      label="Start time"
      variant="outlined"
      type="time"
      class="mb-4"
      max-width="500"
      :disabled="props.disabled"
    />
    <VTextField
      v-if="['immediate', 'hourly'].includes(schedule.frequency)"
      v-model="schedule.hours[1]"
      label="End time"
      variant="outlined"
      type="time"
      class="mb-4"
      max-width="500"
      :disabled="props.disabled"
    />
    <div v-if="['hourly', 'immediate'].includes(schedule.frequency)"><p class="text-body-2">On the following days</p></div>
    <div v-if="['weekly'].includes(schedule.frequency)"><p class="text-body-2">On the following days</p></div>
    <DaySelect
      v-if="!['never', 'monthly', 'daily'].includes(schedule.frequency)"
      v-model="schedule.days"
      :multiple="['immediate', 'hourly', 'weekly'].includes(schedule.frequency)"
      class="mb-4"
      max-width="500"
      :disabled="props.disabled"
    />
    <div v-if="['monthly'].includes(schedule.frequency)">
      <p class="text-body-2">On the following days of the month</p>
      <div class="d-flex flex-row">
        <IconCheckbox
          :model-value="daysOfMonthExpressionDisabled"
          class="mb-4"
          @update:model-value="(value: boolean | string[] | undefined) => toggleDayOfMonthExpression(value ? 'disabled' : 'enabled')"
          width="50"
          :disabled="props.disabled"
        />
        <VCombobox
          v-model="schedule.daysOfMonth"
          :items="DAY_OF_MONTH_OPTIONS"
          label="Days of month"
          multiple
          chips
          closable-chips
          class="mb-4"
          max-width="450"
          :disabled="props.disabled || daysOfMonthExpressionEnabled"
        />
      </div>
      <p class="text-body-2">Or on the following day of the month</p>
      <div class="d-flex flex-row">
        <IconCheckbox v-model="daysOfMonthExpressionEnabled" class="mb-4" @update:model-value="toggleDayOfMonthExpression('enabled')" width="50" :disabled="props.disabled" />
        <VCombobox v-model="ordinalExpression" :items="MONTH_ORDINAL_OPTIONS" class="mb-4" max-width="180" :disabled="props.disabled || daysOfMonthExpressionDisabled" @update:model-value="updateDayOfMonthExpression" style="margin-right: 20px" />
        <VCombobox v-model="daysOfWeekExpression" :items="DAY_OF_WEEK_OPTIONS" label="Day of week" class="mb-4" max-width="250" :disabled="props.disabled || daysOfMonthExpressionDisabled" @update:model-value="updateDayOfMonthExpression" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-control--compact p.text-body-2 {
  margin-block: 0 4px;
}

.schedule-control--compact :deep(.v-input.mb-4) {
  margin-bottom: 8px !important;
}
</style>
