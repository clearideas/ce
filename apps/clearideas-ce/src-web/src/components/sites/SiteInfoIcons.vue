<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useContentStore } from '../../stores'
import { useProfileStore } from '../../stores'
import type { Site } from '../../types/domain'
import SiteItemMenu from './menuItems/SiteItemMenu.vue'

const props = defineProps<{ item: Site }>()
const contentStore = useContentStore()
const profileStore = useProfileStore()
const router = useRouter()
const { mobile } = useDisplay()

const isFavourite = computed(() => (profileStore.user?.attributes?.sites?.favourites ?? []).includes(props.item.id))
const canManageSite = computed(() => ['owner', 'admin'].includes(props.item.currentUserRole ?? ''))
const siteAccessState = computed<'public' | 'shared' | 'private'>(() => {
  if (props.item.visibility === 'public') return 'public'
  if (props.item.owned === false) return 'shared'
  return 'private'
})
const visibilityTooltip = computed(() => siteAccessState.value === 'public' ? 'Public site' : 'Private site')

async function navigateToSiteTab(tab: 'users' | 'settings') {
  contentStore.activeTab = tab
  await router.push({ name: 'site-tab', params: { siteId: props.item.id, siteTab: tab } })
}
</script>

<template>
  <div class="info-icons">
    <div v-if="!mobile" class="info-icon">
      <Tippy :content="isFavourite ? 'Remove from favourites' : 'Add to favourites'" placement="top">
        <span class="site-info-icons__target">
          <VIcon
            icon="fasl fa-star"
            :color="isFavourite ? 'feature-secondary' : 'secondary'"
            :class="{ 'site-info-icons__favourite--inactive': !isFavourite }"
            aria-label="Favourite"
            @click.prevent.stop="profileStore.toggleFavourites(props.item.id)"
          />
        </span>
      </Tippy>
    </div>
    <div v-if="!mobile && props.item.owned === false" class="info-icon d-none d-sm-flex">
      <Tippy content="Shared with you" placement="top">
        <span class="site-info-icons__target">
          <VIcon icon="fass fa-link" color="primary" />
        </span>
      </Tippy>
    </div>
    <div v-if="!mobile && props.item.owned === true && canManageSite" class="info-icon d-none d-sm-flex">
      <Tippy :content="visibilityTooltip" placement="top">
        <span class="site-info-icons__target site-info-icons__target--interactive" @click.stop="navigateToSiteTab('settings')">
          <VIcon
            :icon="siteAccessState === 'public' ? 'fass fa-eye' : 'fass fa-eye-slash'"
            :color="siteAccessState === 'public' ? 'success' : 'error'"
            class="site-info-icons__visibility"
          />
        </span>
      </Tippy>
    </div>
    <div v-if="!mobile" class="info-icon">
      <Tippy content="Site users" placement="top">
        <span class="site-info-icons__target site-info-icons__target--interactive" @click.stop="navigateToSiteTab('users')">
          <VIcon icon="fasl fa-users" color="secondary" />
        </span>
      </Tippy>
    </div>
    <SiteItemMenu :site-id="props.item.id" icon="fasl fa-ellipsis" color="secondary" />
  </div>
</template>

<style scoped>
.info-icons { display: inline-flex; align-items: center; gap: 6px; }
.info-icon:last-child { margin-left: 2px; }
.site-info-icons__target { display: inline-flex; align-items: center; justify-content: center; height: 18px; min-width: 18px; line-height: 1; pointer-events: auto; }
.site-info-icons__target--interactive { cursor: pointer; }
.site-info-icons__visibility { transform: none; }
.site-info-icons__favourite--inactive { opacity: 0.42; }
</style>
