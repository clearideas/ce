<script setup lang="ts">
import ContentItemMenu from './menuItems/ContentItemMenu.vue'
import type { ContentItem } from '../../types/domain'

interface Props {
  item: ContentItem
  menuOnly?: boolean
}

const { item } = defineProps<Props>()
</script>

<template>
  <div class="info-icons">
    <div class="info-icon">
      <ContentItemMenu :item="item" icon="fas fa-ellipsis" color="secondary" />
    </div>
  </div>
</template>
