<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BaseTabs from '../components/base/BaseTabs.vue'
import UserActions from '../components/users/actions/UserActions.vue'
import User from '../components/users/User.vue'
import UserGroups from '../components/users/UserGroups.vue'
import { useContainerWidth } from '../composables/useContainerWidth'
import { useUserStore } from '../stores'

const usersStore = useUserStore()
const contentHeaderRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useContainerWidth(contentHeaderRef)

type Tab = 'all' | 'groups'

const tabs = computed<{ title: string; key: Tab }[]>(() => [
  { title: 'All users', key: 'all' },
  { title: 'Groups', key: 'groups' },
])

const tab = ref<Tab>('all')
const interactionsArmed = ref(false)

onMounted(() => {
  loadContent()
})

async function loadContent() {
  try {
    await usersStore.getUsers()
  } finally {
    interactionsArmed.value = true
  }
}

function dismissHero() {
  if (!interactionsArmed.value) return
}

watch(tab, (nextTab, previousTab) => {
  if (previousTab && nextTab !== previousTab) dismissHero()
})
</script>

<template>
  <div class="users-view">
    <div class="content-header" ref="contentHeaderRef">
      <BaseTabs
        v-model="tab"
        :tabs="tabs"
        :container-width="containerWidth"
        :narrow-breakpoint="768"
      />
      <UserActions @interact="dismissHero" />
    </div>
    <div class="content-header-gap" />
    <div class="users-body">
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
  width: calc(100% + 16px);
  margin-left: -8px;
  margin-right: -8px;
  padding-left: 8px;
  padding-right: 8px;
  box-sizing: border-box;
  overflow: visible;
}
</style>
