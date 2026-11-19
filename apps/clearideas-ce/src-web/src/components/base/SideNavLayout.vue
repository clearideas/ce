<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

/**
 * Two-pane page layout with a section navigation on the left (Settings, site settings, Analytics).
 *
 * - `items`: sections (`{ key, label, icon, href? }`) and headings (`{ heading }`), in display order.
 *   With `href` (the section's URL) an item is a real link: announced as one, and Ctrl/⌘/middle-click
 *   opens the section in a new tab; a plain click still goes through `update:modelValue`.
 * - `modelValue`: the selected section key. Selecting emits `update:modelValue`; the parent decides
 *   whether to accept it (e.g. after an unsaved-changes prompt) — the selection is never local state.
 * - At ≤ 959 px the navigation collapses to an icon rail; each item then shows its label as a tooltip
 *   and keeps it as its accessible name.
 * - The default slot is the selected section's content.
 *
 * Keyboard: the navigation is one Tab stop; Arrow Up/Down (Home/End) move between items and Enter
 * activates (Vuetify's list navigation).
 */
export type SideNavItem = { key: string; label: string; icon: string; href?: string } | { heading: string }

const props = withDefaults(
  defineProps<{
    items: SideNavItem[]
    modelValue: string
    /** Accessible name of the section navigation. */
    label: string
  }>(),
  {},
)
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()
const { smAndDown } = useDisplay()

function isHeading(item: SideNavItem): item is { heading: string } {
  return 'heading' in item
}

const linkItems = computed(() => props.items.every(item => isHeading(item) || Boolean(item.href)))

function select(key: string) {
  if (key !== props.modelValue) emit('update:modelValue', key)
}

function onItemClick(event: MouseEvent | KeyboardEvent, key: string) {
  // Let the browser open the link elsewhere (new tab/window); a plain activation is an in-app selection.
  if (
    'button' in event &&
    (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  )
    return
  event.preventDefault()
  select(key)
}
</script>

<template>
  <div class="side-nav-layout">
    <!-- Link items: the list itself is the labelled navigation landmark (like the main sidebar) — a
         list role would require list items. Button-like items: a <nav> around a regular list. -->
    <component
      :is="linkItems ? 'div' : 'nav'"
      class="side-nav-layout__nav"
      :aria-label="linkItems ? undefined : props.label"
    >
      <VList
        nav
        density="compact"
        class="side-nav-layout__list"
        bg-color="transparent"
        v-bind="linkItems ? { role: 'navigation', 'aria-label': props.label } : {}"
      >
        <template v-for="item in props.items" :key="isHeading(item) ? `heading-${item.heading}` : item.key">
          <VListSubheader v-if="isHeading(item)" class="text-uppercase text-medium-emphasis">
            {{ item.heading }}
          </VListSubheader>
          <VListItem
            v-else
            v-tippy="smAndDown ? { content: item.label, placement: 'right' } : null"
            :active="props.modelValue === item.key"
            :aria-current="props.modelValue === item.key ? 'page' : undefined"
            :aria-label="smAndDown ? item.label : undefined"
            :href="item.href"
            color="primary"
            @click="(event: MouseEvent | KeyboardEvent) => onItemClick(event, item.key)"
          >
            <template #prepend><VIcon :icon="item.icon" /></template>
            <VListItemTitle>{{ item.label }}</VListItemTitle>
          </VListItem>
        </template>
      </VList>
    </component>
    <div class="side-nav-layout__main">
      <div class="side-nav-layout__viewport">
        <div class="side-nav-layout__content d-flex flex-column ga-3">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Two panes; the layout itself is the scroll container and the navigation stays in view (sticky).
// `--settings-shadow-zone` (set by the site-settings page) widens the pane so card shadows are not
// clipped; elsewhere it is 0.
.side-nav-layout {
  --ci-settings-card-title-size: 1.125rem;
  --ci-settings-card-title-line-height: 1.45;
  --ci-settings-card-subtitle-size: 0.95rem;
  --ci-settings-card-subtitle-line-height: 1.5;
  --ci-settings-section-heading-size: 0.96rem;
  --ci-settings-section-heading-line-height: 1.3rem;
  --ci-settings-section-heading-weight: 600;
  --ci-settings-section-heading-letter-spacing: -0.004em;
  --ci-settings-section-heading-margin-bottom: 0.3rem;
  --ci-settings-section-block-gap: 1.25rem;
  --ci-settings-copy-margin-bottom: 0.75rem;
  --ci-settings-inline-row-gap: 0.625rem;

  display: flex;
  flex-direction: row;
  flex-grow: 1;
  gap: 12px;
  position: relative;
  height: 100%;
  min-height: 0;

  /* stylelint-disable length-zero-no-unit -- the fallback needs a unit: a bare 0 is invalid in calc(). */
  width: calc(100% + var(--settings-shadow-zone, 0px) * 2);
  margin-left: calc(var(--settings-shadow-zone, 0px) * -1);
  margin-right: calc(var(--settings-shadow-zone, 0px) * -1);
  padding-left: var(--settings-shadow-zone, 0px);
  padding-right: var(--settings-shadow-zone, 0px);

  /* stylelint-enable length-zero-no-unit */
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.side-nav-layout__nav {
  position: sticky;
  top: 0;
  z-index: 0;
  align-self: flex-start;
  flex-shrink: 0;
  width: 250px;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  padding: 8px 0 0;
  background: transparent;
}

.side-nav-layout__list {
  border-radius: 0;
}

.side-nav-layout__main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  min-height: 0;
  overflow: visible;
}

.side-nav-layout__viewport {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  margin: 0;
  padding: 8px 0 0;
  box-sizing: border-box;
  overflow: visible;
  scrollbar-gutter: stable;
}

.side-nav-layout__content {
  width: 100%;
  min-height: fit-content;
  padding-bottom: 24px;
  overflow: visible;
}

// Icon rail on narrow screens: items become centred icon buttons (the label stays the accessible
// name and shows as a tooltip), headings become short dividers.
@media (max-width: 959px) {
  .side-nav-layout__nav {
    flex: 0 0 56px;
    width: 56px;
  }

  .side-nav-layout__list {
    padding-inline: 0;
  }

  .side-nav-layout__list :deep(.v-list-item) {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    min-height: 34px;
    margin-inline: auto;
    padding-inline: 0;
    border-radius: var(--ci-border-radius);
  }

  .side-nav-layout__list :deep(.v-list-item__prepend) {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 20px;
    min-width: 20px;
    height: 20px;
    margin-inline-end: 0;
    transform: translate(calc(-50% + 2px), -50%);
  }

  .side-nav-layout__list :deep(.v-list-item__prepend > .v-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-size: 1rem;
    line-height: 1;
  }

  .side-nav-layout__list :deep(.v-list-item__prepend > .v-icon .svg-inline--fa) {
    display: block;
    width: 1rem;
    height: 1rem;
    font-size: 1rem;
    line-height: 1;
  }

  .side-nav-layout__list :deep(.v-list-item__content),
  .side-nav-layout__list :deep(.v-list-item__append) {
    display: none;
  }

  .side-nav-layout__list :deep(.v-list-subheader) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 18px;
    padding-inline: 0;

    .v-list-subheader__text {
      opacity: 0;
    }

    &::before {
      position: absolute;
      content: '';
      inline-size: 24px;
      block-size: 1px;
      background: rgba(var(--v-border-color), var(--v-border-opacity));
    }
  }
}
</style>
