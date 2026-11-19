<script setup lang="ts">
import { useSlots } from 'vue'

interface Props {
  icon: string | undefined
  label?: string
  size?: 'small' | 'medium'
  menuOpen?: boolean
  cursor?: 'default' | 'pointer'
  showChevron?: boolean
  iconTooltip?: string
  color?: string
  iconColor?: string
  fontSize?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  size: 'medium',
  menuOpen: false,
  cursor: 'default',
  showChevron: true,
  iconTooltip: '',
  color: undefined,
  iconColor: undefined,
  fontSize: undefined,
})

const slots = useSlots()
</script>

<template>
  <div
    class="compact-inline-selector"
    :style="{
      color:
        props.color ??
        (props.size === 'small' ? 'rgb(var(--v-theme-secondary))' : 'rgb(var(--v-theme-on-surface))'),
      cursor: props.cursor,
      fontSize: typeof props.fontSize === 'number' ? `${props.fontSize}px` : props.fontSize,
    }"
  >
    <div class="compact-inline-selector__visual">
      <span
        v-tippy="
          props.iconTooltip
            ? {
                content: props.iconTooltip,
                placement: 'top',
              }
            : undefined
        "
        class="compact-inline-selector__icon-target"
      >
        <VIcon
          class="compact-inline-selector__icon"
          :class="{ 'fa-fade': props.menuOpen }"
          :size="props.size === 'small' ? 'x-small' : 'small'"
          :icon="props.icon"
          :color="props.iconColor ?? (props.size === 'small' ? 'secondary' : 'default')"
        />
      </span>
      <span
        v-if="props.label"
        class="compact-inline-selector__label"
        :class="{
          'compact-inline-selector__label--small': props.fontSize == null && props.size === 'small',
          'compact-inline-selector__label--medium': props.fontSize == null && props.size === 'medium',
        }"
      >
        {{ props.label }}
      </span>
      <VIcon
        v-if="props.showChevron"
        class="compact-inline-selector__chevron"
        icon="fas fa-chevron-down"
        :color="props.iconColor ?? (props.size === 'small' ? 'secondary' : 'default')"
      />
    </div>
    <div v-if="slots.default" class="compact-inline-selector__control">
      <slot />
    </div>
  </div>
</template>

<style>
.compact-inline-selector {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-grow: 0;
  flex-shrink: 0;
}

.compact-inline-selector__visual {
  display: flex;
  align-items: center;
  gap: 3px;
  pointer-events: none;
}

.compact-inline-selector__icon {
  transition: transform 0.3s ease;
}

.compact-inline-selector__icon-target {
  display: inline-flex;
  pointer-events: auto;
}

.compact-inline-selector__label {
  line-height: 1;
  white-space: nowrap;
}

.compact-inline-selector__label--small {
  font-size: 12px;
}

.compact-inline-selector__label--medium {
  font-size: 14px;
}

.compact-inline-selector__chevron {
  font-size: 10px;
  height: 12px;
  opacity: 0.72;
  width: 12px;
}

.compact-inline-selector__control {
  position: absolute;
  inset: -4px;
  z-index: 1;
}

.compact-inline-selector__select {
  flex-grow: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  opacity: 0;

  .v-field,
  .v-field__overlay {
    background: transparent;
    background-color: transparent;
    box-shadow: none;
  }

  .v-field {
    gap: 1px;
  }

  .v-label {
    display: none;
  }

  .v-field__field {
    padding-inline-end: 0;
  }

  .v-field__input {
    min-height: 0;
    padding: 0;
    margin: auto 0;
  }

  .v-field__append-inner {
    padding: 0;
    margin: auto 0;
    width: auto;
  }

  .v-field__append-inner .v-icon {
    font-size: 10px;
    height: 12px;
    opacity: 0.72;
    width: 12px;
  }

  .v-select__selection {
    margin-inline-end: 0;
  }
}

.compact-inline-selector-menu {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}
</style>
