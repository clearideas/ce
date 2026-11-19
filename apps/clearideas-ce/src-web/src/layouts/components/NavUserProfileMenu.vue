<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Session } from '../../types/domain'
import Avatar from '../../components/base/Avatar.vue'
import { avatarInitials } from '../../config/avatar'
import { appConfigApi } from '../../api/client'
import { ICONS } from '../../icons'

const props = defineProps<{ session: Session }>()
defineEmits<{ logout: [] }>()
const router = useRouter()
const profileMenuOpen = ref(false)
const docsEnabled = ref(false)
/** The visible initials are part of the name (WCAG 2.5.3 Label in Name: "click AL" works by voice). */
const triggerLabel = computed(
  () => `Account menu, ${avatarInitials(props.session.user.name, props.session.user.email)}`,
)

const items = computed(() => [
  { title: 'Home', to: '/sites', icon: ICONS.sites },
  { title: 'Settings', to: '/settings', icon: ICONS.settings },
  ...(docsEnabled.value ? [{ title: 'Documentation', to: '/docs', icon: ICONS.docs }] : []),
])

onMounted(async () => {
  try {
    docsEnabled.value = (await appConfigApi.get()).docsEnabled
  } catch {
    docsEnabled.value = false
  }
})

function handleClick(item: { to?: string; href?: string }) {
  if (item.to) void router.push(item.to)
  if (item.href) window.open(item.href, '_blank')
}
</script>

<template>
  <VMenu v-model="profileMenuOpen" location="bottom end" offset="8">
    <template #activator="{ props: menuProps }">
      <VBtn
        v-bind="menuProps"
        icon
        variant="text"
        size="small"
        class="navbar-avatar-trigger"
        :aria-label="triggerLabel"
      >
        <Avatar :name="props.session.user.name" :email="props.session.user.email" :size="32" />
      </VBtn>
    </template>
    <VList min-width="280">
      <VListItem lines="two">
        <template #prepend>
          <Avatar :name="props.session.user.name" :email="props.session.user.email" :size="36" />
        </template>
        <VListItemTitle>{{ props.session.user.name }}</VListItemTitle>
        <VListItemSubtitle class="nav-profile-menu__subtitle text-caption">
          {{ props.session.user.email }}
        </VListItemSubtitle>
      </VListItem>
      <VDivider aria-hidden="true" class="my-2" />
      <VListItem v-for="item in items" :key="item.title" @click="handleClick(item)">
        <template #prepend><VIcon size="small" :icon="item.icon" /></template>
        <VListItemTitle>{{ item.title }}</VListItemTitle>
      </VListItem>
      <VDivider aria-hidden="true" class="my-2" />
      <VListItem @click="$emit('logout')">
        <template #prepend><VIcon size="small" :icon="ICONS.logout" /></template>
        <VListItemTitle>Log out</VListItemTitle>
      </VListItem>
    </VList>
  </VMenu>
</template>

<style scoped>
.navbar-avatar-trigger {
  width: 36px;
  height: 36px;
}

.nav-profile-menu__subtitle {
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-weight: 400;
  /* The colour already carries the emphasis; VListItemSubtitle's own opacity would halve it. */
  opacity: 1;
}
</style>
