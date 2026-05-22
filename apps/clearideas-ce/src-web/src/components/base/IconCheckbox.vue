<script setup lang="ts">
import { computed, ref, watch } from 'vue'
interface Props {
  size?: 'x-small' | 'small' | 'default' | 'large' | number
  id?: string
  label?: string
  description?: string
  color?: string
  iconChecked?: string
  iconUnchecked?: string
  colorChecked?: string
  class?: string
  width?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
  color: 'default',
  iconChecked: 'far fa-square-check',
  iconUnchecked: 'far fa-square',
  colorChecked: 'primary',
  disabled: false,
})

const model = defineModel<boolean | string[] | undefined>({ required: true })

const checked = ref(false)

const emit = defineEmits(['change'])

// Initialize model value if it's an array
watch(
  () => model.value,
  newValue => {
    if (Array.isArray(newValue)) {
      checked.value = props.id ? newValue.includes(props.id) : false
    } else {
      // Treat undefined as false
      checked.value = newValue ?? false
    }
  },
  { immediate: true },
)

watch(checked, newValue => {
  if (Array.isArray(model.value)) {
    if (props.id) {
      if (newValue && !model.value.includes(props.id)) {
        model.value.push(props.id)
      } else if (!newValue) {
        const index = model.value.indexOf(props.id)
        if (index !== -1) {
          model.value.splice(index, 1)
        }
      }
    }
    emit('change', model.value)
  } else {
    model.value = newValue
    emit('change', model.value)
  }
})

const icon = computed(() => {
  return checked.value ? props.iconChecked : props.iconUnchecked
})
</script>

<template>
  <div class="d-flex flex-column ga-1" :style="{ width: `${props.width}px` }" :class="props.class">
    <div class="d-flex align-center ga-2">
      <VIcon
        :icon="icon"
        :size="props.size"
        :class="{ 'cursor-pointer': !props.disabled, 'cursor-not-allowed': props.disabled }"
        :color="props.disabled ? 'disabled' : checked ? props.colorChecked : props.color"
        @click.stop="!props.disabled && (checked = !checked)"
      />
      <slot name="label" v-if="props.label">
        <span :class="{ [`color-${props.color}`]: props.color, 'text-disabled': props.disabled }">
          {{ props.label }}
        </span>
      </slot>
      <slot name="indicator" />
    </div>
    <slot name="description" v-if="props.description">
      <span
        class="text-caption"
        :class="{ [`color-${props.color}`]: props.color, 'text-disabled': props.disabled }"
        style="margin-left: 28px"
      >
        {{ props.description }}
      </span>
    </slot>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
