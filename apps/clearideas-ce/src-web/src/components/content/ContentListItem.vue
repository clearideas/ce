<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { computed } from 'vue'

interface Props {
  text?: string
  subtitle?: string
  prependIcon?: string
  prependWidth?: string
  prependHeight?: string
  isSorting?: boolean
  prependBelowOnMobile?: boolean
  clickable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  prependWidth: '40px',
  prependHeight: '40px',
  isSorting: false,
  prependBelowOnMobile: false,
  clickable: true,
})

const emit = defineEmits<{
  click: any
}>()
const { mobile } = useDisplay()

const showPrependBelow = computed(() => props.prependBelowOnMobile && mobile.value)

const handleClick = () => {
  if (!props.clickable) return
  emit('click')
}
</script>

<template>
  <div
    class="content-item"
    :class="{ 'is-sorting': props.isSorting, 'content-item--static': !props.clickable }"
    @click="handleClick"
  >
    <div class="prepend" v-if="$slots.checkbox">
      <slot name="checkbox"></slot>
    </div>
    <template v-if="showPrependBelow">
      <div class="content-area content-area--stacked">
        <div class="content-row">
          <div class="content">
            <div class="title">
              <slot name="text">
                {{ props.text }}
              </slot>
            </div>
            <div v-if="$slots.latest" class="subtitle">
              <slot name="latest"></slot>
            </div>
            <div v-if="$slots.bookmark" class="subtitle">
              <slot name="bookmark"></slot>
            </div>
            <div v-if="$slots.subtitle || props.subtitle" class="subtitle">
              <slot name="subtitle">{{ props.subtitle }}</slot>
            </div>
          </div>
          <div class="append" v-if="$slots.append" @click.stop>
            <slot name="append"></slot>
          </div>
        </div>
        <div
          v-if="$slots.prepend || props.prependIcon"
          class="content-prepend content-prepend--below"
          :style="{ width: props.prependWidth, height: props.prependHeight }"
        >
          <slot name="prepend">
            <VIcon :icon="props.prependIcon" />
          </slot>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="content-area">
        <div
          v-if="$slots.prepend || props.prependIcon"
          class="content-prepend"
          :style="{ width: props.prependWidth, height: props.prependHeight }"
        >
          <slot name="prepend">
            <VIcon :icon="props.prependIcon" />
          </slot>
        </div>
        <div class="content">
          <div class="title">
            <slot name="text">
              {{ props.text }}
            </slot>
          </div>
          <div v-if="$slots.latest" class="subtitle">
            <slot name="latest"></slot>
          </div>
          <div v-if="$slots.bookmark" class="subtitle">
            <slot name="bookmark"></slot>
          </div>
          <div v-if="$slots.subtitle || props.subtitle" class="subtitle">
            <slot name="subtitle">{{ props.subtitle }}</slot>
          </div>
        </div>
      </div>
      <div class="append" v-if="$slots.append" @click.stop>
        <slot name="append"></slot>
      </div>
    </template>
  </div>
</template>

<style scoped>
.content-item.is-sorting {
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(var(--v-theme-info), 0.15),
    rgba(var(--v-theme-info), 0.15) 8px,
    transparent 8px,
    transparent 16px
  );
  border: solid 1px rgba(var(--v-theme-info), 0.6);
}

.content-item--static {
  cursor: default;
}

.content-area--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.content-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.content-prepend--below {
  width: 100% !important;
  max-width: 100%;
}
</style>
