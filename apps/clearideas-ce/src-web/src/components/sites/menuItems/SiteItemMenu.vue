<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useContentStore, useProfileStore, useSiteStore } from '../../../stores'
import { ICONS } from '../../../icons'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'

interface Props {
  siteId: string
  icon?: string
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'fas fa-ellipsis',
  color: 'secondary',
})

const siteStore = useSiteStore()
const contentStore = useContentStore()
const profileStore = useProfileStore()
const router = useRouter()
const { mobile } = useDisplay()
const isMenuOpen = ref(false)

const site = computed(() => siteStore.sites.find(item => item.id === props.siteId))
const isFavourite = computed(() =>
  (profileStore.user?.attributes?.sites?.favourites ?? []).includes(props.siteId),
)
const canManageSite = computed(() => ['owner', 'admin'].includes(site.value?.currentUserRole ?? ''))
const siteAccessState = computed<'public' | 'private'>(() =>
  site.value?.visibility === 'public' ? 'public' : 'private',
)

async function toggleFavourite() {
  isMenuOpen.value = false
  await profileStore.toggleFavourites(props.siteId)
}

async function navigateToSiteTab(tab: 'users' | 'settings') {
  isMenuOpen.value = false
  contentStore.activeTab = tab
  await router.push({ name: 'site-tab', params: { siteId: props.siteId, siteTab: tab } })
}

const blockDialog = ref(false)
const blocking = ref(false)

function openBlockDialog() {
  isMenuOpen.value = false
  blockDialog.value = true
}

async function blockSite() {
  blocking.value = true
  try {
    await siteStore.suppressSiteInvitation(props.siteId)
    blockDialog.value = false
  } finally {
    blocking.value = false
  }
}
</script>

<template>
  <div v-if="site" class="info-icon">
    <VMenu v-model="isMenuOpen" offset-y text="More">
      <template #activator="{ props: slotProps }">
        <BaseButton
          v-bind="slotProps"
          :icon="props.icon"
          intent="tertiary"
          :color="props.color"
          size="small"
          density="comfortable"
          class="site-item-menu__activator"
          tooltip="More actions"
          :aria-label="`More actions for ${site.name}`"
          aria-haspopup="menu"
          @click.stop.prevent
        />
      </template>
      <VList density="compact" nav>
        <VListItem v-if="mobile" @click.stop="toggleFavourite">
          <template #append>
            <VIcon
              size="small"
              :icon="isFavourite ? ICONS.favourite : ICONS.favouriteOff"
              :color="isFavourite ? 'feature-secondary' : 'secondary'"
            />
          </template>
          <VListItemTitle>{{ isFavourite ? 'Remove from favourites' : 'Add to favourites' }}</VListItemTitle>
        </VListItem>
        <VListItem v-if="mobile" @click.stop="navigateToSiteTab('users')">
          <template #append>
            <VIcon size="small" icon="fas fa-users" color="secondary" />
          </template>
          <VListItemTitle>Site users</VListItemTitle>
        </VListItem>
        <VListItem
          v-if="mobile && site?.owned === true && canManageSite"
          @click.stop="navigateToSiteTab('settings')"
        >
          <template #append>
            <VIcon
              size="small"
              :icon="siteAccessState === 'public' ? 'fas fa-eye' : 'fas fa-eye-slash'"
              :color="siteAccessState === 'public' ? 'success' : 'error'"
            />
          </template>
          <VListItemTitle>{{ siteAccessState === 'public' ? 'Public site' : 'Private site' }}</VListItemTitle>
        </VListItem>
        <VDivider aria-hidden="true" v-if="mobile" class="my-1" />
        <VListItem @click.stop="openBlockDialog">
          <template #append>
            <VIcon size="small" icon="fas fa-ban" color="secondary" />
          </template>
          <VListItemTitle>Block site</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
    <BaseDialog
      v-model="blockDialog"
      max-width="480"
      title="Block site"
      confirm-text="Block"
      confirm-intent="danger"
      :loading="blocking"
      @confirm="blockSite"
    >
      <VCardText>
        Block “{{ site.name }}”? It will disappear from your sites and navigation. You can unblock it from
        Settings → Sites, or with Undo right after blocking.
      </VCardText>
    </BaseDialog>
  </div>
</template>
