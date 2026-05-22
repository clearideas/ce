<script setup lang="ts">
import { useRouter } from 'vue-router'

interface Props {
  id: string
  siteId: string
}

const router = useRouter()
const props = defineProps<Props>()

function openProperties(event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  void router.push({
    name: 'file',
    params: { siteId: props.siteId, fileId: props.id, fileTab: 'properties' },
  })
}
</script>

<template>
  <VListItem
    density="compact"
    @click.stop.prevent="openProperties"
  >
    <VListItemTitle>Properties</VListItemTitle>
  </VListItem>
</template>
