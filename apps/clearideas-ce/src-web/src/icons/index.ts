/**
 * Concept → glyph map for the CE UI (FontAwesome Free).
 *
 * Use these constants for recurring concepts so the same idea always gets the same icon
 * (`ICONS.settings`, never `'fas fa-gear'` in one place and `'fas fa-cog'` in another).
 * One-off decorative icons may still be written inline as `'fas fa-<name>'`; every name used
 * anywhere must be registered in `./registry.ts`.
 */
export { registerIcons } from './registry'
export { LEGACY_ICON_ALIASES, resolveIconLookup } from './resolve'

export const ICONS = {
  // Navigation / shell
  sites: 'fas fa-house',
  users: 'fas fa-users',
  agents: 'fas fa-robot',
  analytics: 'fas fa-chart-line',
  settings: 'fas fa-gear',
  docs: 'fas fa-book-open',
  logout: 'fas fa-right-from-bracket',
  search: 'fas fa-magnifying-glass',
  menu: 'fas fa-bars',
  themeLight: 'fas fa-sun',
  themeDark: 'fas fa-moon',

  // Actions
  add: 'fas fa-plus',
  addCircle: 'fas fa-circle-plus',
  close: 'fas fa-xmark',
  check: 'fas fa-check',
  refresh: 'fas fa-arrows-rotate',
  upload: 'fas fa-cloud-arrow-up',
  download: 'fas fa-download',
  delete: 'fas fa-trash',
  edit: 'fas fa-pen-to-square',
  copy: 'fas fa-copy',
  more: 'fas fa-ellipsis',
  moreVertical: 'fas fa-ellipsis-vertical',
  newFolder: 'fas fa-folder-plus',
  favourite: 'fas fa-star',
  /** Not a favourite: an outline star, so the state is not conveyed by colour alone (WCAG 1.4.1). */
  favouriteOff: 'far fa-star',
  block: 'fas fa-ban',

  // Views
  viewTiles: 'fas fa-border-all',
  viewList: 'fas fa-list',
  sortAsc: 'fas fa-arrow-down-short-wide',
  sortDesc: 'fas fa-arrow-down-wide-short',

  // Objects
  site: 'fas fa-folder-open',
  folder: 'fas fa-folder',
  file: 'fas fa-file',
  key: 'fas fa-key',
  ai: 'fas fa-wand-magic-sparkles',
  /** Ask (chat across sites) in the navigation. */
  ask: 'fas fa-comments',
  history: 'fas fa-clock-rotate-left',
  public: 'fas fa-globe',
  private: 'fas fa-lock',
  visible: 'fas fa-eye',
  hidden: 'fas fa-eye-slash',
  shared: 'fas fa-link',
  bell: 'fas fa-bell',
  envelope: 'fas fa-envelope',

  // Status
  info: 'fas fa-circle-info',
  success: 'fas fa-circle-check',
  warning: 'fas fa-triangle-exclamation',
  error: 'fas fa-circle-exclamation',
  loading: 'fas fa-spinner',

  // Disclosure
  chevronDown: 'fas fa-chevron-down',
  chevronUp: 'fas fa-chevron-up',
  chevronLeft: 'fas fa-chevron-left',
  chevronRight: 'fas fa-chevron-right',
  caretDown: 'fas fa-caret-down',

  // Checkbox glyphs (regular set)
  checkboxOn: 'far fa-square-check',
  checkboxOff: 'far fa-square',
  checkboxIndeterminate: 'fas fa-square-minus',
} as const

/** Site user roles. Single source for role glyphs (descriptions are unified in Phase 3.6). */
export const ROLE_ICONS = {
  owner: 'fas fa-crown',
  admin: 'fas fa-user-shield',
  editor: 'fas fa-pen-to-square',
  uploader: 'fas fa-upload',
  downloader: 'fas fa-download',
  viewer: 'fas fa-eye',
  disabled: 'fas fa-user-slash',
} as const

export type IconName = (typeof ICONS)[keyof typeof ICONS]
