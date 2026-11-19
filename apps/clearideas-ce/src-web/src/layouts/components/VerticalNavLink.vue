<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

import { isNavLinkActive, type NavMenuItem } from './utils'

interface Props {
  navItem: NavMenuItem
  tippy?: Record<string, unknown> | null
  isVerticalMenuMini?: boolean
}
interface Emit {
  (e: 'closeGroup'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const mobile = defineModel('mobile', {
  type: Boolean,
  default: false,
})

const display = useDisplay()

const tippyKey = computed(() => `tippy-${props.isVerticalMenuMini ? 'rail' : 'expanded'}`)
const textTippyConfig = computed(() => {
  if (props.isVerticalMenuMini) return mobile.value ? { content: navItemLabel.value } : null
  if (!props.tippy) return null
  return props.tippy
})
const navItemLabel = computed(() => props.navItem.title ?? props.navItem.name ?? '')
const navItemTitle = computed(() => props.navItem.title ?? props.navItem.name ?? '')
const navItemMobileTitle = computed(() => props.navItem.mobileTitle ?? navItemTitle.value)
const hasMobileTitle = computed(() => Boolean(props.navItem.mobileTitle))

function handleClick() {
  props.navItem.onClick?.()
  emit('closeGroup')
}
</script>

<template>
  <VDivider aria-hidden="true" v-if="props.navItem.divider" />
  <VListItem
    v-if="props.navItem.to"
    :to="props.navItem.to"
    :active="isNavLinkActive(props.navItem)"
    :target="props.navItem.target ? props.navItem.target : ''"
    :aria-label="navItemLabel"
    @click="handleClick"
  >
    <template #prepend>
      <VImg
        v-if="props.navItem.avatar"
        :src="props.navItem.avatar"
        contain
        height="22"
        width="22"
        class="mr-4"
      />
      <!-- No v-tippy on the icon: tippy's focus listener makes an <svg> keyboard-focusable in Chromium,
           which put every nav icon in the Tab order. The link itself carries the name. -->
      <VIcon
        v-else
        :icon="props.navItem.icon"
        :class="props.navItem.iconClass"
        :color="props.navItem.iconColor"
      />
    </template>
    <template #title>
      <span :key="`text-${tippyKey}`" v-tippy="textTippyConfig">
        {{ display.mobile.value && hasMobileTitle ? navItemMobileTitle : navItemTitle }}
      </span>
    </template>
  </VListItem>

  <VListItem
    v-else-if="props.navItem.href"
    v-tippy="{ content: mobile ? navItemLabel : undefined }"
    :title="display.mobile.value && hasMobileTitle ? navItemMobileTitle : navItemLabel"
    :href="props.navItem.href"
    :active="isNavLinkActive(props.navItem)"
    :target="props.navItem.target ? props.navItem.target : ''"
  >
    <template #prepend>
      <VIcon :icon="props.navItem.icon" :class="props.navItem.iconClass" :color="props.navItem.iconColor" />
    </template>
  </VListItem>
</template>
