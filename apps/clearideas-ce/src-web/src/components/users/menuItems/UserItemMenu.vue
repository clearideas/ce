<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useProfileStore, useUserStore } from '../../../stores'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { ICONS } from '../../../icons'
import type { User } from '../../../types/domain'

interface Props {
  item: Pick<User, 'id' | 'email'> & Partial<User>
  color?: string
  siteId?: string
  role?: string
}

const props = withDefaults(defineProps<Props>(), {
  color: 'secondary',
})
const user = ref<(Pick<User, 'id' | 'email'> & Partial<User>) | null>(null)
const userStore = useUserStore()
const profileStore = useProfileStore()

const isCurrentUser = computed(
  () =>
    (!!profileStore.user?.id && String(user.value?.id ?? '') === String(profileStore.user.id)) ||
    (!!profileStore.user?.email &&
      String(user.value?.email ?? '').toLowerCase() === String(profileStore.user.email).toLowerCase()),
)
const canResendInvite = computed(() => !!props.siteId && props.role !== 'owner')
const canRemoveFromSite = computed(() => !!props.siteId && props.role !== 'owner')
const canRemoveFromAllSites = computed(() => !props.siteId && !isCurrentUser.value)
const hasActions = computed(
  () => canRemoveFromSite.value || canRemoveFromAllSites.value || canResendInvite.value,
)

async function resendInvite() {
  if (props.siteId && user.value?.id) await userStore.resendInvite(props.siteId, user.value.id)
}

/** Removal is destructive (the user loses access at once), so it always asks first. */
const pendingRemoval = ref<'site' | 'all' | null>(null)
const removing = ref(false)
const displayName = computed(() => props.item.displayName ?? props.item.email)

async function confirmRemoval() {
  if (!user.value?.id || !pendingRemoval.value) return
  removing.value = true
  try {
    if (pendingRemoval.value === 'site' && props.siteId)
      await userStore.deleteSiteUser(props.siteId, user.value.id)
    else if (pendingRemoval.value === 'all') await userStore.deleteUser(user.value.id)
    pendingRemoval.value = null
  } finally {
    removing.value = false
  }
}

onMounted(() => {
  user.value = props.item
})
</script>

<template>
  <div v-if="user !== null && user !== undefined && hasActions">
    <VMenu offset-y text="More">
      <template #activator="{ props: slotProps }">
        <BaseButton
          v-bind="slotProps"
          :icon="ICONS.more"
          intent="tertiary"
          :color="props.color"
          size="small"
          density="comfortable"
          tooltip="More actions"
          :aria-label="`More actions for ${props.item.displayName ?? props.item.email}`"
          aria-haspopup="menu"
          @click.prevent
        />
      </template>
      <VList density="compact" nav>
        <VListItem v-if="canRemoveFromSite" @click="pendingRemoval = 'site'">
          <VListItemTitle>Remove from site</VListItemTitle>
        </VListItem>
        <VListItem v-if="canRemoveFromAllSites" @click="pendingRemoval = 'all'">
          <VListItemTitle>Remove from all sites</VListItemTitle>
        </VListItem>
        <VDivider aria-hidden="true" v-if="canResendInvite" class="my-2" />
        <VListItem v-if="canResendInvite" @click="resendInvite">
          <VListItemTitle>Resend invite</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
    <BaseDialog
      :model-value="pendingRemoval !== null"
      max-width="480"
      :title="pendingRemoval === 'all' ? 'Remove from all sites' : 'Remove from site'"
      confirm-text="Remove"
      confirm-intent="danger"
      :loading="removing"
      @update:model-value="value => !value && (pendingRemoval = null)"
      @confirm="confirmRemoval"
    >
      <VCardText v-if="pendingRemoval === 'all'">
        Remove {{ displayName }} from all of your sites? They lose access to every site immediately.
      </VCardText>
      <VCardText v-else>
        Remove {{ displayName }} from this site? They lose access immediately; you can invite them again
        later.
      </VCardText>
    </BaseDialog>
  </div>
</template>
