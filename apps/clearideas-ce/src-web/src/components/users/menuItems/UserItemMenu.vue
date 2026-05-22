<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useProfileStore, useUserStore } from '../../../stores'

interface Props {
  item: any
  color?: string
  siteId?: string
  role?: string
}

const props = withDefaults(defineProps<Props>(), {
  color: 'secondary',
})
const user = ref<any | null>(null)
const userStore = useUserStore()
const profileStore = useProfileStore()

const inviteStatuses = ['pending-invite-response', 'pending-invite', 'pending-invite-response-bounced']
const isCurrentUser = computed(() => (
  (!!profileStore.user?.id && String(user.value?.id ?? '') === String(profileStore.user.id)) ||
  (!!profileStore.user?.email && String(user.value?.email ?? '').toLowerCase() === String(profileStore.user.email).toLowerCase())
))
const canResendInvite = computed(() => !!props.siteId && props.role !== 'owner')
const canRemoveFromSite = computed(() => !!props.siteId && props.role !== 'owner')
const canRemoveFromAllSites = computed(() => !props.siteId && !isCurrentUser.value)
const hasActions = computed(() => canRemoveFromSite.value || canRemoveFromAllSites.value || canResendInvite.value)

async function resendInvite() {
  if (props.siteId && user.value?.id) await userStore.resendInvite(props.siteId, user.value.id)
}

async function removeSiteUser() {
  if (props.siteId && user.value?.id) await userStore.deleteSiteUser(props.siteId, user.value.id)
}

async function removeFromAllSites() {
  if (user.value?.id) await userStore.deleteUser(user.value.id)
}

onMounted(() => {
  user.value = props.item
})
</script>

<template>
  <div v-if="user !== null && user !== undefined && hasActions">
    <VMenu offset-y text="More">
      <template #activator="{ props: slotProps }">
        <VIcon
          v-tippy="{ content: 'More' }"
          v-bind="slotProps"
          :color="props.color"
          aria-label="More"
          @click.prevent
        >
          fas fa-ellipsis
        </VIcon>
      </template>
      <VList density="compact" nav>
        <VListItem v-if="canRemoveFromSite" @click="removeSiteUser">
          <VListItemTitle>Remove from site</VListItemTitle>
        </VListItem>
        <VListItem v-if="canRemoveFromAllSites" @click="removeFromAllSites">
          <VListItemTitle>Remove from all sites</VListItemTitle>
        </VListItem>
        <VDivider v-if="canResendInvite" class="my-2" />
        <VListItem v-if="canResendInvite" @click="resendInvite">
          <VListItemTitle>Resend invite</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
  </div>
</template>
