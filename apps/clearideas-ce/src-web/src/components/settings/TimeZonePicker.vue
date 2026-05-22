<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import { getTimeZoneWithOffset, type TimeZone } from '../../utils/timeZone'

const modelValue = defineModel<string>()

const internalSelectedTimeZone = ref<TimeZone>({
  title: '',
  value: '',
  offset: '',
})
const timeZonesWithOffset = ref<TimeZone[]>([])
const currentTimeZone = ref<TimeZone>(
  getTimeZoneWithOffset(Intl.DateTimeFormat().resolvedOptions().timeZone),
)

function fetchTimeZones() {
  timeZonesWithOffset.value = Intl.supportedValuesOf('timeZone').map(tz => getTimeZoneWithOffset(tz))
}

function matchTimeZone() {
  internalSelectedTimeZone.value = currentTimeZone.value
  modelValue.value = currentTimeZone.value.value
}

function onTimeZoneChange(selected: TimeZone) {
  internalSelectedTimeZone.value = selected
  modelValue.value = selected.value
}

onMounted(() => {
  fetchTimeZones()
  const initialTimeZone = getTimeZoneWithOffset(modelValue.value || currentTimeZone.value.value)

  internalSelectedTimeZone.value = initialTimeZone
  modelValue.value = initialTimeZone.value
})

watch(
  () => modelValue.value,
  newValue => {
    if (newValue && newValue !== internalSelectedTimeZone.value.value) {
      const newTimeZone = timeZonesWithOffset.value.find(tz => tz.value === newValue)
      if (newTimeZone) internalSelectedTimeZone.value = newTimeZone
    }
  },
)
</script>

<template>
  <h4>Current device time zone</h4>
  <p>{{ currentTimeZone.title }}</p>
  <BaseButton
    text="Match current device"
    color="primary"
    variant="outlined"
    @click="matchTimeZone"
  />
  <div class="mt-4"></div>
  <h4>Selected time zone</h4>
  <p>{{ internalSelectedTimeZone.title }}</p>
  <VSelect
    v-model="internalSelectedTimeZone"
    :items="timeZonesWithOffset"
    item-title="title"
    item-value="value"
    label="Time zone"
    return-object
    max-width="500"
    @update:model-value="onTimeZoneChange"
  />
</template>
