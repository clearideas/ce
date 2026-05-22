<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

import { isNavLinkActive } from './utils'

type NavMenuItem = {
  name?: string
  title?: string
  icon?: string
  iconClass?: string
  iconColor?: string
  to?: Record<string, any> | string
  href?: string
  target?: string
  avatar?: string
  divider?: boolean
  onClick?: () => void
  mobileTitle?: string
}

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
const iconTippyConfig = computed(() => {
  if (!props.isVerticalMenuMini || !props.tippy) return null
  return props.tippy
})
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
  <div>
    <VDivider v-if="props.navItem.divider" />
    <VListItem
      v-if="props.navItem.to"
      :to="props.navItem.to"
      :active="isNavLinkActive(props.navItem)"
      :target="props.navItem.target ? props.navItem.target : ''"
      @click="handleClick"
      :aria-label="navItemLabel"
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
        <VIcon
          v-else
          :key="`icon-${tippyKey}`"
          v-tippy="iconTippyConfig"
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
        <VIcon
          :icon="props.navItem.icon"
          :class="props.navItem.iconClass"
          :color="props.navItem.iconColor"
        />
      </template>
    </VListItem>
  </div>
</template>
