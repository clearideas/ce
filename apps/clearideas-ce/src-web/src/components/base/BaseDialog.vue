<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseButton from './BaseButton.vue'
import { ICONS } from '../../icons'
import type { ButtonIntent } from '../../types/ui'

/**
 * The app's dialog. Wraps VDialog + VCard with:
 *
 * - one `v-model` (`modelValue`) and one way to build the footer:
 *   - the 80 % case: `confirmText` (+ `confirmIntent`, `cancelText`, `loading`, `confirmDisabled`)
 *     renders Cancel → Confirm and emits `confirm` / `cancel`;
 *   - otherwise the `actions` slot, rendered inside the same footer chrome.
 *   Putting `VCardActions` in the default slot is no longer supported.
 * - a labelled dialog (`aria-labelledby` → the title) and a named close button;
 * - `loading` disables Cancel, the close button and Escape/backdrop dismissal while work runs.
 * - focus returns to the element that opened the dialog when it closes (VDialog only does this for
 *   its own activator slot; most dialogs here are opened through `v-model`).
 *
 * Convention: Cancel is `tertiary`; Confirm is `primary`, or `danger` for destructive actions.
 */
interface Props {
  title?: string
  width?: string | number
  maxWidth?: string | number
  persistent?: boolean
  fullscreen?: boolean
  scrollable?: boolean
  showClose?: boolean
  cardClass?: string
  contentClass?: string
  actionsClass?: string
  confirmText?: string
  confirmIntent?: ButtonIntent
  confirmDisabled?: boolean
  cancelText?: string
  /** Work in progress: Confirm shows a spinner and the dialog cannot be dismissed. */
  loading?: boolean
  /**
   * `id` of a `<VForm>` in the body. The Confirm button becomes that form's submit button
   * (so Enter in a field and the button run the same `@submit` handler); `confirm` is not emitted.
   */
  form?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showClose: true,
  cardClass: '',
  contentClass: '',
  actionsClass: '',
  confirmIntent: 'primary',
  cancelText: 'Cancel',
  confirmDisabled: false,
  loading: false,
})

const emit = defineEmits<{ close: []; confirm: []; cancel: []; afterLeave: [] }>()
const dialogVisible = defineModel<boolean>({ required: true })

const titleId = useId()
const hasHeader = computed(() => Boolean(props.title) || props.showClose)
const isPersistent = computed(() => props.persistent || props.loading)

// Where keyboard focus was when the dialog opened, to return it there on close (WCAG 2.4.3).
let returnFocusTo: HTMLElement | null = null

/** The element that opened the dialog; for a menu item (gone once the menu closes), the menu's button. */
function opener(): HTMLElement | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return null
  const menu = active.closest<HTMLElement>('.v-overlay[id]')
  const activator = menu ? document.querySelector(`[aria-controls="${CSS.escape(menu.id)}"]`) : null
  return activator instanceof HTMLElement ? activator : active
}

watch(
  dialogVisible,
  open => {
    if (open) returnFocusTo = opener()
  },
  { immediate: true },
)

const card = ref<{ $el: HTMLElement } | null>(null)

function afterLeave() {
  const target = returnFocusTo
  returnFocusTo = null
  // Only when focus is still in the (closing) dialog or already lost, and the opener is still on the
  // page (not after a navigation).
  const active = document.activeElement
  const focusInDialogOrLost = !active || active === document.body || Boolean(card.value?.$el.contains(active))
  if (target?.isConnected && focusInDialogOrLost) target.focus()
  emit('afterLeave')
}

function closeDialog() {
  if (props.loading) return
  dialogVisible.value = false
  emit('close')
}

function cancel() {
  if (props.loading) return
  emit('cancel')
  closeDialog()
}
</script>

<template>
  <VDialog
    v-model="dialogVisible"
    :width="props.width"
    :max-width="props.maxWidth"
    :persistent="isPersistent"
    :fullscreen="props.fullscreen"
    :scrollable="props.scrollable"
    :aria-labelledby="props.title ? titleId : undefined"
    @after-leave="afterLeave"
  >
    <VCard
      ref="card"
      :class="['base-dialog__card', { 'base-dialog__card--fullscreen': props.fullscreen }, props.cardClass]"
    >
      <div v-if="$slots.top" class="base-dialog__top">
        <slot name="top" />
      </div>

      <VCardTitle v-if="hasHeader || $slots.title || $slots.append" class="base-dialog__title">
        <div :id="titleId" class="base-dialog__title-text">
          <slot name="title">{{ props.title }}</slot>
        </div>
        <div class="base-dialog__title-actions">
          <slot name="append" />
          <BaseButton
            v-if="props.showClose"
            :icon="ICONS.close"
            intent="tertiary"
            density="comfortable"
            aria-label="Close"
            :disabled="props.loading"
            @click="closeDialog"
          />
        </div>
      </VCardTitle>

      <div class="base-dialog__body" :class="props.contentClass">
        <slot />
      </div>

      <template v-if="props.confirmText || $slots.actions">
        <VDivider />
        <VCardActions class="base-dialog__actions bg-surface-light" :class="props.actionsClass">
          <slot name="actions">
            <VSpacer />
            <BaseButton
              :text="props.cancelText"
              intent="tertiary"
              :disabled="props.loading"
              @click="cancel"
            />
            <BaseButton
              :text="props.confirmText"
              :intent="props.confirmIntent"
              :loading="props.loading"
              :disabled="props.confirmDisabled"
              :type="props.form ? 'submit' : 'button'"
              :form="props.form"
              @click="props.form ? undefined : emit('confirm')"
            />
          </slot>
        </VCardActions>
      </template>
    </VCard>
  </VDialog>
</template>

<style scoped>
.base-dialog__card {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 48px);
  overflow: hidden;
}

.base-dialog__card--fullscreen {
  height: 100dvh;
  max-height: 100dvh;
}

.base-dialog__top {
  flex: 0 0 auto;
}

.base-dialog__title {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 0.75rem;
  justify-content: space-between;
}

.base-dialog__title-text {
  flex: 1 1 auto;
  min-width: 0;
}

.base-dialog__title-actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;
}

.base-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.base-dialog__actions {
  flex: 0 0 auto;
  gap: 8px;
}
</style>
