<script setup lang="ts">
import ContentItemMenu from './menuItems/ContentItemMenu.vue'

interface Props {
  item: any
  menuOnly?: boolean
}

const { item } = defineProps<Props>()
</script>

<template>
  <div class="info-icons">
    <div class="info-icon">
      <ContentItemMenu :item="item" icon="fasl fa-ellipsis" color="secondary" />
    </div>
  </div>
</template>
