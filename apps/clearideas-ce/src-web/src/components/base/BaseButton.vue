<script setup lang="ts">
import { useAttrs } from 'vue'

type Variant = 'elevated' | 'flat' | 'tonal' | 'outlined' | 'text' | 'plain' | undefined
type Density = 'default' | 'comfortable' | 'compact' | undefined

interface ButtonProps {
  text?: string
  slim?: boolean
  color?: string
  variant?: Variant
  density?: Density
  prependIcon?: string
  prependIconClass?: string
  prependIconColor?: string
  size?: string
  rounded?: string | number | boolean
  appendIcon?: string
  appendIconClass?: string
  appendIconColor?: string
  disabled?: boolean
  loading?: boolean
  icon?: string
  tooltip?: string
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right'
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<ButtonProps>(), {
  color: 'primary',
  variant: 'flat',
  slim: false,
  disabled: false,
  rounded: true,
  density: 'default',
  type: 'button',
})
const attrs = useAttrs()
</script>

<template>
  <Tippy :content="props.tooltip" :placement="props.tooltipPosition" v-if="props.tooltip">
    <VBtn v-bind="{ ...props, ...attrs }" class="cursor-pointer">
      <template #default>
        <slot name="default">
          <VIcon v-if="props.icon" :icon="props.icon" />
          {{ props.text }}
        </slot>
      </template>
      <template #prepend>
        <slot name="prepend" v-if="props.text">
          <VIcon
            v-if="props.prependIcon"
            :icon="props.prependIcon"
            :color="props.prependIconColor"
            :class="
              props.size === 'large' ? `${props.prependIconClass} ml-2` : props.prependIconClass
            "
          />
        </slot>
      </template>
      <template #append>
        <slot name="append">
          <VIcon
            v-if="props.appendIcon"
            :icon="props.appendIcon"
            :color="props.appendIconColor"
            :class="props.appendIconClass"
          />
        </slot>
      </template>
    </VBtn>
  </Tippy>
  <VBtn v-else v-bind="{ ...props, ...attrs }" class="cursor-pointer">
    <template #default>
      <slot name="default">
        <VIcon v-if="props.icon" :icon="props.icon" />
        {{ props.text }}
      </slot>
    </template>
    <template #prepend>
      <slot name="prepend" v-if="props.text">
        <VIcon
          v-if="props.prependIcon"
          :icon="props.prependIcon"
          :color="props.prependIconColor"
          :class="
            props.size === 'large' ? `${props.prependIconClass} ml-2` : props.prependIconClass
          "
        />
      </slot>
    </template>
    <template #append>
      <slot name="append">
        <VIcon
          v-if="props.appendIcon"
          :icon="props.appendIcon"
          :color="props.appendIconColor"
          :class="props.appendIconClass"
        />
      </slot>
    </template>
  </VBtn>
</template>
