<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import IconCheckbox from './IconCheckbox.vue'

type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

interface Props {
  multiple?: boolean
  disabled?: boolean
  rules?: ((value: DayOfWeek | DayOfWeek[]) => string | boolean)[]
}

const props = withDefaults(defineProps<Props>(), {
  multiple: true,
  disabled: false,
})

const DAY_OF_WEEK_OPTIONS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

const dayLabels: Record<DayOfWeek, string> = {
  Monday: 'Monday',
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday',
  Friday: 'Friday',
  Saturday: 'Saturday',
  Sunday: 'Sunday',
}

const modelValue = defineModel<DayOfWeek | DayOfWeek[]>({
  required: true,
  validator: value => {
    if (!value) return false
    if (Array.isArray(value)) return value.length > 0
    return true
  },
})

const selectedDaysArray = computed({
  get: (): DayOfWeek[] => {
    if (!modelValue.value) return props.multiple ? ['Monday'] : []
    if (Array.isArray(modelValue.value)) {
      return modelValue.value.length > 0 ? modelValue.value : props.multiple ? ['Monday'] : []
    }
    return [modelValue.value]
  },
  set: (value: DayOfWeek[]) => {
    if (props.multiple) {
      modelValue.value = value.length > 0 ? value : selectedDaysArray.value.length > 0 ? selectedDaysArray.value : ['Monday']
    } else {
      modelValue.value = value[0] || modelValue.value
    }
  },
})

const hasSelection = computed(() => selectedDaysArray.value.length > 0)
const validationRules = computed(() => [
  ...(props.rules || []),
  (value: DayOfWeek | DayOfWeek[]) => {
    if (!value) return 'Select at least one day'
    if (Array.isArray(value) && value.length === 0) return 'Select at least one day'
    return true
  },
])

watch(
  () => (Array.isArray(modelValue.value) ? modelValue.value.length : 0),
  (newLength, oldLength) => {
    if (props.multiple && Array.isArray(modelValue.value) && oldLength === 1 && newLength === 0 && !props.disabled) {
      nextTick(() => {
        if (Array.isArray(modelValue.value) && modelValue.value.length === 0) modelValue.value = ['Monday']
      })
    }
  },
)

watch(
  () => modelValue.value,
  newValue => {
    if (props.multiple && (!newValue || (Array.isArray(newValue) && newValue.length === 0)) && !props.disabled) {
      modelValue.value = ['Monday']
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="day-selector">
    <div class="days-grid">
      <div
        v-for="day in DAY_OF_WEEK_OPTIONS"
        :key="day"
        class="day-item"
        :class="{ selected: selectedDaysArray.includes(day), disabled: props.disabled }"
      >
        <IconCheckbox
          v-model="selectedDaysArray"
          :id="day"
          :disabled="props.disabled"
          class="day-checkbox"
          size="small"
        />
        <span class="day-label">{{ dayLabels[day] }}</span>
      </div>
    </div>
    <div class="validation-container">
      <VTextField :rules="validationRules" style="display: none" :model-value="hasSelection ? 'valid' : ''" />
    </div>
  </div>
</template>

<style scoped>
.day-selector {
  width: 100%;
}

.days-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.day-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 90px;
  justify-content: center;
}

.day-item:hover:not(.disabled) {
  background: rgb(var(--v-theme-surface-variant));
}

.day-item.selected {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.day-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.day-checkbox {
  flex-shrink: 0;
}

.day-label {
  font-size: 0.875rem;
  font-weight: 400;
  user-select: none;
}

.validation-container {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  height: 0;
  overflow: hidden;
}
</style>
