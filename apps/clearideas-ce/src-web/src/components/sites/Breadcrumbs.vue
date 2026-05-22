<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useContentStore, useSiteStore } from '../../stores'

interface Ancestor { id: string; name: string; kind?: string }
interface Props {
  siteId?: string
  loading?: boolean
  icon?: string
  avatar?: string
  compact?: boolean
  readOnly?: boolean
  contentId?: string | null
  suffixItems?: Array<{ id: string; title: string; icon?: string }>
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  icon: 'fasl fa-folder-open',
  compact: false,
  readOnly: false,
  contentId: null,
  suffixItems: () => [],
})

const items = ref<Ancestor[]>([])
const siteAncestor = ref<Ancestor[]>([])
const loadingSiteAncestor = ref(false)
const contentStore = useContentStore()
const siteStore = useSiteStore()

const ancestors = computed(() => items.value.map(i => ({
  id: i.id,
  title: i.name,
  to: { name: i.kind === 'file' ? 'file' : 'site', params: { siteId: siteStore.currentSite?.id, ...(i.id && siteStore.currentSite?.id !== i.id && i.kind !== 'file' ? { folderId: i.id } : {}), ...(i.kind === 'file' ? { fileId: i.id } : {}) } },
  disabled: false,
})))
const siteAncestors = computed(() => siteAncestor.value.map(i => ({ id: i.id, title: i.name, to: { name: 'site', params: { siteId: i.id } }, disabled: false })))

function loadAncestors() {
  const siteItem = { id: siteStore.currentSite?.id ?? props.siteId ?? '', name: siteStore.currentSite?.name ?? '', kind: 'site' }
  const formattedAncestors = [siteItem, ...contentStore.ancestors]
  siteAncestor.value = formattedAncestors.slice(0, 1) as Ancestor[]
  items.value = [
    ...(formattedAncestors.slice(1) as Ancestor[]),
    ...props.suffixItems.map(item => ({ id: item.id, name: item.title, kind: 'context' })),
  ]
}
function loadSiteAndAncestors() { loadingSiteAncestor.value = true; loadAncestors(); loadingSiteAncestor.value = false }
watch(() => contentStore.ancestors, loadAncestors, { immediate: true })
watch(() => [siteStore.currentSite, props.contentId, props.suffixItems], loadSiteAndAncestors, { immediate: true })
</script>

<template>
  <div class="breadcrumbs" :class="{ 'breadcrumbs--compact': compact, 'breadcrumbs--readonly': readOnly }">
    <div class="breadcrumb-item">
      <VProgressCircular v-if="props.loading || loadingSiteAncestor" :size="compact ? 18 : 28" :style="{ margin: '2px' }" color="info" :width="compact ? 3 : 6" indeterminate />
      <template v-else>
        <VImg v-if="props.avatar" :src="props.avatar" :width="compact ? 18 : 32" :height="compact ? 18 : 32" class="flex-grow-0 flex-shrink-0" />
        <VIcon v-if="!props.avatar && props.icon" color="default" class="flex-grow-0 flex-shrink-0" :icon="props.icon" :size="compact ? 16 : 32" />
      </template>
      <RouterLink v-if="!loadingSiteAncestor && !readOnly" class="font-weight-bold" :to="siteAncestors[0]?.to ?? { name: 'sites' }">{{ siteAncestors[0]?.title ?? siteStore.currentSite?.name }}</RouterLink>
      <span v-else-if="!loadingSiteAncestor" class="font-weight-bold">{{ siteAncestors[0]?.title ?? siteStore.currentSite?.name }}</span>
      <VIcon v-if="items.length > 0" size="extra-small">fasl fa-chevron-right</VIcon>
    </div>
    <div class="breadcrumb-item" v-for="(item, index) in ancestors" :key="item.id">
      <RouterLink v-if="!readOnly" :class="{ 'font-weight-bold': item.id === props.siteId }" :to="item.to">{{ item.title }}</RouterLink>
      <span v-else :class="{ 'font-weight-bold': item.id === props.siteId }">{{ item.title }}</span>
      <VIcon v-if="index !== ancestors.length - 1" size="extra-small" icon="fasl fa-chevron-right" />
    </div>
  </div>
</template>

<style scoped>
.breadcrumbs--compact { margin: 0; gap: 3px; }
.breadcrumbs--compact .breadcrumb-item { height: 22px; gap: 3px; font-size: 12px; }
.breadcrumbs--readonly .breadcrumb-item, .breadcrumbs--readonly .breadcrumb-item span { color: rgba(var(--v-theme-on-surface), 0.62); }
</style>
