<script setup lang="ts">
import { computed, useId } from 'vue'
import { ICONS } from '../../icons'

/**
 * The app's checkbox. Renders a real `<input type="checkbox">` (via Vuetify's VCheckboxBtn) with the
 * square/check glyphs the UI has always used, so it is keyboard-operable (Space), focusable, labelled
 * and announced.
 *
 * Model:
 * - `boolean`  — a single on/off control.
 * - `string[]` — membership of `id` in the array (multi-select). The array is replaced, never
 *                mutated, so parents that hand in computed/store state keep working.
 */
type Size = 'x-small' | 'small' | 'default' | 'large' | number

interface Props {
  size?: Size
  /** Membership key when the model is an array. Not the DOM id. */
  id?: string
  label?: string
  description?: string
  /** Colour of the unchecked glyph and label. `default` inherits. */
  color?: string
  iconChecked?: string
  iconUnchecked?: string
  colorChecked?: string
  /** Fixed width in px (layout helper used by settings grids). */
  width?: string | number
  disabled?: boolean
  indeterminate?: boolean
  /** Accessible name when no visible label is rendered (e.g. row selection). */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
  color: 'default',
  iconChecked: ICONS.checkboxOn,
  iconUnchecked: ICONS.checkboxOff,
  colorChecked: 'primary',
  disabled: false,
  indeterminate: false,
})

const emit = defineEmits<{ change: [value: boolean | string[] | undefined] }>()
const model = defineModel<boolean | string[] | undefined>({ required: true })

const controlId = useId()
const descriptionId = `${controlId}-description`

const checked = computed(() => {
  if (Array.isArray(model.value)) return props.id ? model.value.includes(props.id) : false
  return Boolean(model.value)
})

const ICON_SIZES: Record<Exclude<Size, number>, number> = { 'x-small': 12, small: 16, default: 20, large: 24 }
const iconPx = computed(() => (typeof props.size === 'number' ? props.size : ICON_SIZES[props.size]))
const rootStyle = computed(() => ({
  '--icon-checkbox-icon-size': `${iconPx.value}px`,
  '--icon-checkbox-control-size': `${Math.max(24, iconPx.value + 8)}px`,
  ...(props.width ? { width: `${props.width}px` } : {}),
}))

function setChecked(next: boolean) {
  if (props.disabled) return
  if (Array.isArray(model.value)) {
    if (!props.id) return
    const without = model.value.filter(value => value !== props.id)
    model.value = next ? [...without, props.id] : without
  } else {
    model.value = next
  }
  emit('change', model.value)
}
</script>

<template>
  <div class="icon-checkbox" :class="{ 'icon-checkbox--disabled': props.disabled }" :style="rootStyle">
    <div class="icon-checkbox__row">
      <VCheckboxBtn
        :id="controlId"
        :model-value="checked"
        :indeterminate="props.indeterminate"
        :disabled="props.disabled"
        :true-icon="props.iconChecked"
        :false-icon="props.iconUnchecked"
        :indeterminate-icon="ICONS.checkboxIndeterminate"
        :color="props.colorChecked"
        :base-color="props.color === 'default' ? undefined : props.color"
        :aria-label="props.label || $slots.label ? undefined : props.ariaLabel"
        :aria-describedby="props.description || $slots.description ? descriptionId : undefined"
        density="compact"
        class="icon-checkbox__control"
        @update:model-value="setChecked(Boolean($event))"
      />
      <label
        v-if="props.label || $slots.label"
        :for="controlId"
        class="icon-checkbox__label"
        :class="{ [`text-${props.color}`]: props.color !== 'default', 'text-disabled': props.disabled }"
      >
        <slot name="label">{{ props.label }}</slot>
      </label>
      <slot name="indicator" />
    </div>
    <span
      v-if="props.description || $slots.description"
      :id="descriptionId"
      class="icon-checkbox__description text-caption"
      :class="{ [`text-${props.color}`]: props.color !== 'default', 'text-disabled': props.disabled }"
    >
      <slot name="description">{{ props.description }}</slot>
    </span>
  </div>
</template>

<style scoped>
.icon-checkbox {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.icon-checkbox__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-checkbox__control {
  flex: 0 0 auto;

  --v-selection-control-size: var(--icon-checkbox-control-size);
}

.icon-checkbox__control :deep(.v-selection-control__input .v-icon) {
  font-size: var(--icon-checkbox-icon-size);
}

.icon-checkbox__label {
  cursor: pointer;
  user-select: none;
}

.icon-checkbox--disabled .icon-checkbox__label {
  cursor: not-allowed;
}

.icon-checkbox__description {
  /* Align with the label: control width + row gap. */
  margin-left: calc(var(--icon-checkbox-control-size) + 8px);
}
</style>
