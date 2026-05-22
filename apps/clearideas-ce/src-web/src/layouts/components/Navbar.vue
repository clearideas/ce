<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useDisplay } from 'vuetify'
import type { Session } from '../../types/domain'
import Icon from '../../components/brand/Icon.vue'
import Logo from '../../components/brand/Logo.vue'
import NavSearchBar from './NavSearchBar.vue'
import NavUserProfileMenu from './NavUserProfileMenu.vue'
import ThemeToggle from './ThemeToggle.vue'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ logout: [] }>()
const isDrawerOpen = defineModel<boolean>('isDrawerOpen', { default: false })
const isVerticalMenuMini = defineModel<boolean>('isVerticalMenuMini', { default: false })
const { mobile, lgAndUp } = useDisplay()
const isSearchExpanded = ref(false)
</script>

<template>
  <VAppBar app location="top" color="transparent" flat>
    <div class="navbar" :class="{ 'search-expanded': isSearchExpanded }">
      <div class="logo">
        <RouterLink to="/sites" aria-label="Clear Ideas home">
          <Icon v-if="mobile || isVerticalMenuMini" height="34" class="mt-1 ci-nav-icon" />
          <div v-else class="ci-nav-brand">
            <Logo class="ci-nav-logo" />
            <span class="ci-nav-edition">Community Edition</span>
          </div>
        </RouterLink>
        <VBtn
          v-if="lgAndUp"
          icon
          variant="plain"
          size="x-small"
          :class="isVerticalMenuMini ? 'rail-mode-is-on' : ''"
          aria-label="Toggle menu"
          @click="isVerticalMenuMini = !isVerticalMenuMini"
        >
          <VIcon size="15" :icon="isVerticalMenuMini ? 'fasl fa-chevron-right' : 'fasl fa-chevron-left'" />
        </VBtn>
      </div>
      <div class="search">
        <NavSearchBar v-model="isSearchExpanded" />
      </div>
      <div class="actions">
        <ThemeToggle
          v-if="!(mobile && isSearchExpanded)"
        />
        <div v-if="!(mobile && isSearchExpanded)" class="navbar-user-trigger">
          <NavUserProfileMenu :session="props.session" @logout="$emit('logout')" />
        </div>
        <VAppBarNavIcon
          v-show="mobile"
          icon="fasl fa-bars"
          size="small"
          @click.stop="isDrawerOpen = !isDrawerOpen"
        />
      </div>
    </div>
  </VAppBar>
</template>

<style scoped lang="scss">
:deep(.v-toolbar),
:deep(.v-toolbar__content),
:deep(.v-app-bar) {
  overflow: visible !important;
}

:deep(.v-toolbar__content) {
  position: relative;
  z-index: 20;
  width: 100%;
  height: var(--ci-navbar-height) !important;
  padding: 0 !important;
}

.navbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  flex-direction: row;
  flex: 1 1 auto;
  gap: 12px;
  width: 100%;
  min-width: 0;
  height: var(--ci-navbar-height);
  padding-inline: 14px;
  box-sizing: border-box;
}

.logo {
  display: flex;
  align-items: center;
  flex-direction: row;
  flex: 0 0 auto;
  gap: 10px;
  min-width: 0;
}

.logo a {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: inherit;
  line-height: 0;
  text-decoration: none;
}

.search {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
}

.actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  height: 44px;
  margin-inline-start: auto;
}

.navbar-control {
  min-height: 36px !important;
}

.navbar-theme-btn {
  width: 36px !important;
  height: 36px !important;
}

.navbar-user-trigger {
  display: flex;
  align-items: center;
  min-height: 36px;
}

.ci-nav-logo {
  width: 154px;
  max-width: 100%;
}

.ci-nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ci-nav-edition {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding-left: 14px;
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.ci-nav-icon {
  width: 34px;
}

@media (max-width: 720px) {
  .navbar {
    gap: 8px;
    padding-inline: 10px;
  }

  .search {
    justify-content: flex-end;
  }

  .navbar.search-expanded .search {
    flex: 1 1 auto;
    justify-content: stretch;
  }
}
</style>
