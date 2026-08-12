<script setup lang="ts">
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
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  width: undefined,
  maxWidth: undefined,
  persistent: false,
  fullscreen: false,
  scrollable: false,
  showClose: true,
  cardClass: '',
  contentClass: '',
  actionsClass: '',
})

const dialogVisible = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  close: []
}>()

function closeDialog() {
  dialogVisible.value = false
  emit('close')
}
</script>

<template>
  <VDialog
    v-model="dialogVisible"
    :width="props.width"
    :max-width="props.maxWidth"
    :persistent="props.persistent"
    :fullscreen="props.fullscreen"
    :scrollable="props.scrollable"
  >
    <VCard
      :class="[
        'base-dialog__card',
        { 'base-dialog__card--fullscreen': props.fullscreen },
        props.cardClass,
      ]"
    >
      <div v-if="$slots.top" class="base-dialog__top">
        <slot name="top" />
      </div>

      <VCardTitle
        v-if="$slots.title || $slots.append || props.title || props.showClose"
        class="base-dialog__title"
      >
        <div class="base-dialog__title-text">
          <slot name="title">
            {{ props.title }}
          </slot>
        </div>
        <div class="base-dialog__title-actions">
          <slot name="append" />
          <VBtn
            v-if="props.showClose"
            color="secondary"
            icon="fasl fa-xmark"
            variant="text"
            density="comfortable"
            @click="closeDialog"
          />
        </div>
      </VCardTitle>

      <div class="base-dialog__body" :class="props.contentClass">
        <slot />
      </div>

      <VCardActions v-if="$slots.actions" class="base-dialog__actions" :class="props.actionsClass">
        <slot name="actions" />
      </VCardActions>
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
}
</style>
