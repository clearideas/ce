<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Session } from '../../types/domain'
import Avatar from '../../components/brand/Avatar.vue'
import { appConfigApi } from '../../api/client'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ logout: [] }>()
const router = useRouter()
const profileMenuOpen = ref(false)
const docsEnabled = ref(false)

const items = computed(() => [
  { title: 'Home', to: '/sites', icon: 'fasds fa-house' },
  { title: 'Settings', to: '/settings', icon: 'fasl fa-gear' },
  ...(docsEnabled.value ? [{ title: 'Documentation', to: '/docs', icon: 'fasl fa-books' }] : []),
])

onMounted(async () => {
  try {
    docsEnabled.value = (await appConfigApi.get()).docsEnabled
  } catch {
    docsEnabled.value = false
  }
})

function handleClick(item: (typeof items.value)[number]) {
  if ('to' in item && item.to) void router.push(item.to)
  if ('href' in item && item.href) window.open(item.href, '_blank')
}
</script>

<template>
  <VMenu v-model="profileMenuOpen" location="bottom end" offset="8">
    <template #activator="{ props: menuProps }">
      <div v-bind="menuProps" class="navbar-avatar-trigger cursor-pointer">
        <Avatar :name="props.session.user.name" :email="props.session.user.email" :size="32" />
      </div>
    </template>
    <VList min-width="280">
      <VListItem lines="two">
        <template #prepend>
          <Avatar :name="props.session.user.name" :email="props.session.user.email" :size="36" />
        </template>
        <VListItemTitle>{{ props.session.user.name }}</VListItemTitle>
        <VListItemSubtitle class="nav-profile-menu__subtitle text-caption d-flex align-center ga-2">
          {{ props.session.user.email }}
          <VChip size="x-small" color="primary" variant="flat">CE</VChip>
        </VListItemSubtitle>
      </VListItem>
      <VDivider class="my-2" />
      <VListItem v-for="item in items" :key="item.title" @click="handleClick(item)">
        <template #prepend><VIcon size="small" :icon="item.icon" /></template>
        <VListItemTitle>{{ item.title }}</VListItemTitle>
      </VListItem>
      <VDivider class="my-2" />
      <VListItem @click="$emit('logout')">
        <template #prepend><VIcon size="small" icon="fasl fa-right-from-bracket" /></template>
        <VListItemTitle>Log out</VListItemTitle>
      </VListItem>
    </VList>
  </VMenu>
</template>

<style scoped>
.navbar-avatar-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-profile-menu__subtitle {
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-weight: 400;
}
</style>
