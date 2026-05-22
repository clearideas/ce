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
    <VCard :class="props.cardClass">
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

      <div :class="props.contentClass">
        <slot />
      </div>
    </VCard>
  </VDialog>
</template>

<style scoped>
.base-dialog__title {
  align-items: center;
  display: flex;
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
</style>
