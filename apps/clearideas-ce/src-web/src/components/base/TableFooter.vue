<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

type Direction = 'first' | 'prev' | 'next' | 'last'
type PaginationMode = 'server' | 'client'

interface PaginationInfo {
  total: number
  page: number
  limit: number
  totalPages: number
  hasMore: boolean
}

interface Props {
  items: readonly unknown[]
  itemLabel?: string
  showPageSize?: boolean
  showPageNumbers?: boolean
  showPageNavigation?: boolean
  pagination?: PaginationInfo | null
  mode?: PaginationMode
}

const props = withDefaults(defineProps<Props>(), {
  itemLabel: '',
  showPageSize: true,
  showPageNumbers: true,
  showPageNavigation: true,
  pagination: undefined,
  mode: 'client',
})
const emit = defineEmits<{ 'update:page': [number] }>()
const pageModel = defineModel<number>('page', { required: true })
const itemsPerPage = defineModel<number>('itemsPerPage', { required: true })
const { smAndDown } = useDisplay()
const pageSizes = [10, 25, 50, 100]

const serverPage = computed(() => props.pagination?.page ?? 1)
const serverTotalPages = computed(() => Math.max(1, props.pagination?.totalPages ?? 1))
const serverTotalItems = computed(() => props.pagination?.total ?? 0)
const serverStartItem = computed(() => (serverPage.value - 1) * itemsPerPage.value + 1)
const serverEndItem = computed(() => Math.min(serverPage.value * itemsPerPage.value, serverTotalItems.value))
const clientTotalPages = computed(() => Math.max(1, Math.ceil(props.items.length / itemsPerPage.value)))
const clientTotalItems = computed(() => props.items.length)
const clientStartItem = computed(() => (pageModel.value - 1) * itemsPerPage.value + 1)
const clientEndItem = computed(() => Math.min(pageModel.value * itemsPerPage.value, props.items.length))
const currentPage = computed(() => (props.mode === 'server' ? serverPage.value : pageModel.value))
const totalPages = computed(() => (props.mode === 'server' ? serverTotalPages.value : clientTotalPages.value))
const totalItems = computed(() => (props.mode === 'server' ? serverTotalItems.value : clientTotalItems.value))
const startItem = computed(() => (props.mode === 'server' ? serverStartItem.value : clientStartItem.value))
const endItem = computed(() => (props.mode === 'server' ? serverEndItem.value : clientEndItem.value))

function changePage(direction: Direction) {
  if (props.mode === 'server') {
    let newPage = serverPage.value
    switch (direction) {
      case 'first':
        if (serverPage.value > 1) newPage = 1
        break
      case 'prev':
        if (serverPage.value > 1) newPage = serverPage.value - 1
        break
      case 'next':
        if (serverPage.value < serverTotalPages.value) newPage = serverPage.value + 1
        break
      case 'last':
        if (serverPage.value !== serverTotalPages.value) newPage = serverTotalPages.value
        break
    }
    if (newPage !== serverPage.value) emit('update:page', newPage)
  } else {
    switch (direction) {
      case 'first':
        if (pageModel.value > 1) pageModel.value = 1
        break
      case 'prev':
        if (pageModel.value > 1) pageModel.value--
        break
      case 'next':
        if (pageModel.value < clientTotalPages.value) pageModel.value++
        break
      case 'last':
        if (pageModel.value < clientTotalPages.value) pageModel.value = clientTotalPages.value
        break
    }
  }
}
</script>

<template>
  <div class="data-table-footer">
    <div
      v-if="props.items && props.items.length > 0 && props.showPageSize"
      class="d-flex flex-row align-center gc-2"
    >
      <span v-if="!smAndDown" class="text-caption text-secondary">Page size</span>
      <VSelect
        v-model="itemsPerPage"
        aria-label="Page size"
        :items="pageSizes"
        density="compact"
        hide-details
        menu-icon="fas fa-caret-down"
        class="ml-1 page-size-select-compact"
        color="secondary"
        variant="plain"
      />
    </div>
    <div
      v-if="props.items.length > 0 && props.showPageNumbers && !smAndDown"
      class="text-caption text-secondary"
    >
      {{ props.itemLabel || 'Items' }} {{ startItem }} to {{ endItem }} of {{ totalItems }}
    </div>
    <div v-else-if="props.items.length > 0 && props.showPageNumbers" class="text-caption text-secondary">
      {{ startItem }}-{{ endItem }}/{{ totalItems }}
    </div>
    <div
      v-if="(props.items.length > itemsPerPage || props.pagination) && props.showPageNavigation"
      class="mr-2"
    >
      <VBtn
        v-if="!smAndDown"
        icon="fas fa-backward-step"
        aria-label="First page"
        variant="text"
        size="small"
        density="comfortable"
        color="secondary"
        :disabled="currentPage === 1"
        @click="changePage('first')"
      />
      <VBtn
        icon="fas fa-chevron-left"
        aria-label="Previous page"
        variant="text"
        size="small"
        density="comfortable"
        color="secondary"
        :disabled="currentPage === 1"
        @click="changePage('prev')"
      />
      <span class="text-caption text-secondary">{{
        smAndDown ? `${currentPage}/${totalPages}` : `Page ${currentPage} of ${totalPages}`
      }}</span>
      <VBtn
        icon="fas fa-chevron-right"
        aria-label="Next page"
        variant="text"
        size="small"
        density="comfortable"
        color="secondary"
        :disabled="currentPage === totalPages"
        @click="changePage('next')"
      />
      <VBtn
        v-if="!smAndDown"
        icon="fas fa-forward-step"
        aria-label="Last page"
        variant="text"
        size="small"
        density="comfortable"
        color="secondary"
        :disabled="currentPage === totalPages"
        @click="changePage('last')"
      />
    </div>
    <div
      v-if="props.items.length < itemsPerPage && !props.pagination && props.showPageNavigation"
      class="mr-2"
    ></div>
  </div>
</template>

<style scoped>
.data-table-footer {
  margin-right: var(--table-footer-fab-offset, 68px);
}

.page-size-select-compact {
  width: auto;
  min-width: 0;
  max-width: 44px;
  flex: 0 0 auto;
  padding: 0;
  margin: 0;
}

.page-size-select-compact :deep(.v-field) {
  min-height: 24px;
  background: transparent;
  border: 0;
  box-shadow: none;
  outline: 0;
}

.page-size-select-compact :deep(.v-field__overlay) {
  display: none;
}

.page-size-select-compact :deep(.v-field--focused) {
  border: 0;
  box-shadow: none;
  outline: 0;
}

/* The plain variant dims the value; keep it at full strength so it stays >= 4.5:1 (secondary). */
.page-size-select-compact :deep(.v-field__input),
.page-size-select-compact :deep(.v-select__selection-text) {
  opacity: 1;
}

.page-size-select-compact :deep(.v-field__input) {
  min-height: 0;
  padding: 0;
  margin: auto 0;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-secondary));
}

.page-size-select-compact :deep(.v-field__append-inner) {
  padding: 0;
  margin: auto 0;
  margin-left: -2px;
  align-self: auto;
  margin-top: 3px;
}

.page-size-select-compact :deep(.v-field__outline) {
  display: none;
}

.page-size-select-compact :deep(.v-icon) {
  color: rgb(var(--v-theme-secondary));
  font-size: 17px;
}
</style>
