<script setup lang="ts">
type SiteTagItem = { id: string; title: string; role?: string; expiresAt?: string | null }
defineProps<{ items: SiteTagItem[]; showAll?: boolean }>()
</script>

<template>
  <div class="d-flex flex-wrap ga-1">
    <VChip v-for="item in items" :key="item.id" size="x-small" variant="tonal"
      >{{ item.title }} · {{ item.role }}</VChip
    >
  </div>
</template>
