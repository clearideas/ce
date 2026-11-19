<script setup lang="ts">
import { computed } from 'vue'
import type { ButtonIntent } from '../../types/ui'

/**
 * The app's button. A thin, typed wrapper over VBtn that adds:
 *
 * - `intent` — the one decision a call site should make. Maps to colour + variant so the same
 *   hierarchy is used everywhere: `primary` (one per view/dialog), `secondary`, `tertiary`
 *   (toolbar utilities, Cancel), `danger` (destructive confirm). `color`/`variant` still work and
 *   win when given, for the rare one-off.
 * - `tooltip` — rendered with `v-tippy` on the button itself (vue-tippy is the app's tooltip system).
 * - Icon-only mode via `icon`, which requires an accessible name: `aria-label`, or the tooltip text
 *   as a fallback.
 *
 * Sizing/shape/density come from the app-level Vuetify defaults (plugins/vuetify/defaults.ts); this
 * component does not override them, so raw VBtn and BaseButton look identical.
 * Unknown attributes (`class`, `@click`, `aria-*`, `data-*`, `to`, `href`) fall through to VBtn.
 */
type Variant = 'elevated' | 'flat' | 'tonal' | 'outlined' | 'text' | 'plain'
type Density = 'default' | 'comfortable' | 'compact'
type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface Props {
  text?: string
  intent?: ButtonIntent
  color?: string
  variant?: Variant
  size?: string
  density?: Density
  rounded?: string | number | boolean
  slim?: boolean
  block?: boolean
  prependIcon?: string
  appendIcon?: string
  /** Icon-only button. Provide `aria-label` (or `tooltip`). */
  icon?: string
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  tooltipPlacement?: TooltipPlacement
  /** @deprecated use `tooltipPlacement` */
  tooltipPosition?: TooltipPlacement
  type?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  tooltipPlacement: 'top',
  // Explicit `undefined` defaults stop Vue's Boolean cast (absent → false), which would otherwise
  // reach VBtn as `rounded: false` and override the app-level `rounded: 'pill'` default.
  rounded: undefined,
  slim: undefined,
  block: undefined,
})

const isIconOnly = computed(() => Boolean(props.icon) && !props.text)

const INTENTS: Record<ButtonIntent, { color: string; variant: Variant }> = {
  primary: { color: 'primary', variant: 'flat' },
  secondary: { color: 'secondary', variant: 'tonal' },
  tertiary: { color: 'secondary', variant: 'text' },
  danger: { color: 'error', variant: 'flat' },
}

const resolved = computed(() => {
  const intent = INTENTS[props.intent ?? 'primary']
  const variant = props.variant ?? intent.variant
  return {
    color: props.color ?? intent.color,
    // Icon buttons never show a fill (styles/overrides.scss), so a filled variant would leave its
    // on-colour icon (white) on the page background — invisible. Draw the icon in the colour instead.
    variant: isIconOnly.value && (variant === 'flat' || variant === 'elevated') ? ('text' as const) : variant,
  }
})

/**
 * Vuetify's `defaults` only apply to props that are *absent* from the vnode — binding
 * `:rounded="undefined"` would count as provided and override the app default. So optional
 * pass-through props are bound only when set.
 */
const vbtnProps = computed(() => {
  const entries: Array<[string, unknown]> = [
    ['size', props.size],
    ['density', props.density],
    ['rounded', props.rounded],
    ['slim', props.slim],
    ['block', props.block],
  ]
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
})

// `icon` together with `text` means "leading icon" (legacy call sites), not icon-only.
const prependIcon = computed(() => props.prependIcon ?? (props.icon && props.text ? props.icon : undefined))
const accessibleName = computed(() => props.ariaLabel ?? (isIconOnly.value ? props.tooltip : undefined))
const tippyConfig = computed(() =>
  props.tooltip
    ? { content: props.tooltip, placement: props.tooltipPosition ?? props.tooltipPlacement }
    : null,
)

if (import.meta.env.DEV && isIconOnly.value && !accessibleName.value) {
  console.warn('[BaseButton] icon-only buttons need `aria-label` or `tooltip` for an accessible name.')
}
</script>

<template>
  <VBtn
    v-tippy="tippyConfig"
    v-bind="vbtnProps"
    :color="resolved.color"
    :variant="resolved.variant"
    :icon="isIconOnly ? props.icon : undefined"
    :prepend-icon="prependIcon"
    :append-icon="props.appendIcon"
    :disabled="props.disabled"
    :loading="props.loading"
    :type="props.type"
    :aria-label="accessibleName"
    :text="isIconOnly ? undefined : props.text"
  >
    <template v-if="$slots.default" #default><slot /></template>
    <template v-if="$slots.prepend" #prepend><slot name="prepend" /></template>
    <template v-if="$slots.append" #append><slot name="append" /></template>
    <!-- VBtn's default loader, plus a name: an unnamed role="progressbar" is an axe serious finding. -->
    <template #loader><VProgressCircular indeterminate width="2" aria-label="Loading" /></template>
  </VBtn>
</template>
