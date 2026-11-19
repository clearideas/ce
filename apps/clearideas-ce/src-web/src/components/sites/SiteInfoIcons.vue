<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useContentStore } from '../../stores'
import { useProfileStore } from '../../stores'
import type { Site } from '../../types/domain'
import BaseButton from '../base/BaseButton.vue'
import { ICONS } from '../../icons'
import SiteItemMenu from './menuItems/SiteItemMenu.vue'

const props = defineProps<{ item: Site }>()
const contentStore = useContentStore()
const profileStore = useProfileStore()
const router = useRouter()
const { mobile } = useDisplay()

const isFavourite = computed(() =>
  (profileStore.user?.attributes?.sites?.favourites ?? []).includes(props.item.id),
)
const canManageSite = computed(() => ['owner', 'admin'].includes(props.item.currentUserRole ?? ''))
const siteAccessState = computed<'public' | 'shared' | 'private'>(() => {
  if (props.item.visibility === 'public') return 'public'
  if (props.item.owned === false) return 'shared'
  return 'private'
})
const visibilityTooltip = computed(() =>
  siteAccessState.value === 'public' ? 'Public site' : 'Private site',
)

async function navigateToSiteTab(tab: 'users' | 'settings') {
  contentStore.activeTab = tab
  await router.push({ name: 'site-tab', params: { siteId: props.item.id, siteTab: tab } })
}
</script>

<template>
  <div class="info-icons">
    <div v-if="!mobile" class="info-icon">
      <BaseButton
        :icon="isFavourite ? ICONS.favourite : ICONS.favouriteOff"
        intent="tertiary"
        :color="isFavourite ? 'feature-secondary' : 'secondary'"
        size="x-small"
        density="comfortable"
        :tooltip="isFavourite ? 'Remove from favourites' : 'Add to favourites'"
        :aria-label="
          isFavourite ? `Remove ${props.item.name} from favourites` : `Add ${props.item.name} to favourites`
        "
        :aria-pressed="isFavourite"
        @click.prevent.stop="profileStore.toggleFavourites(props.item.id)"
      />
    </div>
    <div v-if="!mobile && props.item.owned === false" class="info-icon d-none d-sm-flex">
      <span v-tippy="{ content: 'Shared with you', placement: 'top' }" class="site-info-icons__target">
        <VIcon
          :icon="ICONS.shared"
          color="primary"
          size="14"
          aria-hidden="false"
          aria-label="Shared with you"
        />
      </span>
    </div>
    <div v-if="!mobile && props.item.owned === true && canManageSite" class="info-icon d-none d-sm-flex">
      <BaseButton
        :icon="siteAccessState === 'public' ? ICONS.visible : ICONS.hidden"
        intent="tertiary"
        :color="siteAccessState === 'public' ? 'success' : 'error'"
        size="x-small"
        density="comfortable"
        :tooltip="visibilityTooltip"
        :aria-label="`${visibilityTooltip}: open settings for ${props.item.name}`"
        @click.stop="navigateToSiteTab('settings')"
      />
    </div>
    <div v-if="!mobile" class="info-icon">
      <BaseButton
        :icon="ICONS.users"
        intent="tertiary"
        size="x-small"
        density="comfortable"
        tooltip="Site users"
        :aria-label="`Users of ${props.item.name}`"
        @click.stop="navigateToSiteTab('users')"
      />
    </div>
    <SiteItemMenu :site-id="props.item.id" :icon="ICONS.more" color="secondary" />
  </div>
</template>

<style scoped>
/* WCAG 2.2 target size: the row's icon buttons get a 24 px hit area; the glyph stays x-small. */
.info-icons :deep(.v-btn--icon.v-btn--size-x-small) {
  width: 24px;
  height: 24px;
}

.info-icons {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* Same box and glyph size as the icon buttons next to it. */
.site-info-icons__target {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 24px;
  line-height: 1;
}
</style>
