<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useContentStore, useProfileStore, useSiteStore } from '../../../stores'

interface Props {
  siteId: string
  icon?: string
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'fasl fa-ellipsis',
  color: 'secondary',
})

const siteStore = useSiteStore()
const contentStore = useContentStore()
const profileStore = useProfileStore()
const router = useRouter()
const { mobile } = useDisplay()
const isMenuOpen = ref(false)

const site = computed(() => siteStore.sites.find(item => item.id === props.siteId))
const isFavourite = computed(() => (profileStore.user?.attributes?.sites?.favourites ?? []).includes(props.siteId))
const canManageSite = computed(() => ['owner', 'admin'].includes(site.value?.currentUserRole ?? ''))
const siteAccessState = computed<'public' | 'private'>(() => site.value?.visibility === 'public' ? 'public' : 'private')

async function toggleFavourite() {
  isMenuOpen.value = false
  await profileStore.toggleFavourites(props.siteId)
}

async function navigateToSiteTab(tab: 'users' | 'settings') {
  isMenuOpen.value = false
  contentStore.activeTab = tab
  await router.push({ name: 'site-tab', params: { siteId: props.siteId, siteTab: tab } })
}

async function blockSite() {
  isMenuOpen.value = false
  await siteStore.suppressSiteInvitation(props.siteId)
}
</script>

<template>
  <div v-if="site" class="info-icon">
    <VMenu v-model="isMenuOpen" offset-y text="More">
      <template #activator="{ props: slotProps }">
        <VIcon
          v-tippy="{ content: 'More' }"
          v-bind="slotProps"
          :color="props.color"
          class="site-item-menu__activator"
          aria-label="More"
          @click.stop.prevent
        >
          {{ props.icon }}
        </VIcon>
      </template>
      <VList density="compact" nav>
        <VListItem v-if="mobile" @click.stop="toggleFavourite">
          <template #append>
            <VIcon
              size="small"
              icon="fasl fa-star"
              :color="isFavourite ? 'feature-secondary' : 'secondary'"
            />
          </template>
          <VListItemTitle>{{ isFavourite ? 'Remove from favourites' : 'Add to favourites' }}</VListItemTitle>
        </VListItem>
        <VListItem v-if="mobile" @click.stop="navigateToSiteTab('users')">
          <template #append>
            <VIcon size="small" icon="fasl fa-users" color="secondary" />
          </template>
          <VListItemTitle>Site users</VListItemTitle>
        </VListItem>
        <VListItem v-if="mobile && site?.owned === true && canManageSite" @click.stop="navigateToSiteTab('settings')">
          <template #append>
            <VIcon
              size="small"
              :icon="siteAccessState === 'public' ? 'fass fa-eye' : 'fass fa-eye-slash'"
              :color="siteAccessState === 'public' ? 'success' : 'error'"
            />
          </template>
          <VListItemTitle>{{ siteAccessState === 'public' ? 'Public site' : 'Private site' }}</VListItemTitle>
        </VListItem>
        <VDivider v-if="mobile" class="my-1" />
        <VListItem @click.stop="blockSite">
          <template #append>
            <VIcon size="small" icon="fasl fa-ban" color="secondary" />
          </template>
          <VListItemTitle>Block site</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
  </div>
</template>
