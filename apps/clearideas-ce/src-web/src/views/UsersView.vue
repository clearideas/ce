<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseTabs from '../components/base/BaseTabs.vue'
import UserActions from '../components/users/actions/UserActions.vue'
import User from '../components/users/User.vue'
import UserGroups from '../components/users/UserGroups.vue'
import { useContainerWidth } from '../composables/useContainerWidth'
import PageHeader from '../components/base/PageHeader.vue'

const contentHeaderRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useContainerWidth(contentHeaderRef)

type Tab = 'all' | 'groups'

const tabs = computed<{ title: string; key: Tab }[]>(() => [
  { title: 'All users', key: 'all' },
  { title: 'Groups', key: 'groups' },
])

const tab = ref<Tab>('all')
</script>

<template>
  <div class="users-view">
    <PageHeader title="Users" />
    <div ref="contentHeaderRef" class="content-header">
      <BaseTabs v-model="tab" :tabs="tabs" :container-width="containerWidth" :narrow-breakpoint="768" />
      <UserActions />
    </div>
    <div class="content-header-gap" />
    <div class="users-body page-bleed">
      <User v-if="tab === 'all'" />
      <UserGroups v-if="tab === 'groups'" />
    </div>
  </div>
</template>

<style scoped>
.users-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: visible;
}

.users-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: visible;
}
</style>
