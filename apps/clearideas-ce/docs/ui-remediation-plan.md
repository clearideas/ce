# Clear Ideas CE — UI Remediation Plan

Companion to `ui-review.md`. Finding IDs (F1, I1, A1 …) refer to that document.

The write-up of the whole refactor — what a port leaves behind, results, lessons and how to apply
them to the enterprise application — is `refactor-report.md`.

## Decisions taken

| Topic | Decision | Consequence for the plan |
|-------|----------|--------------------------|
| Icons | FontAwesome **Free** only | Pro-only names are *replaced*, not aliased. One typed icon map; explicit per-icon imports; delete `fontawesome-compat.ts`. |
| Search | Metadata highlighting (`@contentType:` etc.) is a must-keep | `HandlebarsTextarea` stays as the navbar search editor. Work targets discoverability (always-visible on desktop, placeholder, ⌘K hint), a11y wrapper semantics, and a test contract — not replacement. |
| PDF viewer | Treat as a vendored component; package separately | `BasePDFViewer` moves to `packages/clearideas-pdf-viewer` (or `src-web/src/vendor/`) with its own README and a public-API test only. No internal refactor. Stub `t()` becomes a `labels` prop with defaults. |
| View preferences | Both per-browser and per-user | `usePreferences()` composable: localStorage for instant read on boot; profile `attributes.ui` as source of truth, synced after `getProfile()`. |
| Tooltips | `vue-tippy` is the single tooltip system | Keep `Tippy`/`v-tippy`; add a lint rule forbidding `VTooltip`; consolidate tippy defaults (placement, delay, theme) in one plugin file. |
| Active sessions | API exists via Better Auth catch-all (`/api/auth/list-sessions`, `revoke-session`, `revoke-other-sessions`) | Wire the Settings → Security → Active sessions card to real data; confirm endpoint availability with an API test first. If the endpoints turn out to be unreachable through the CE middleware, the section is removed. |

## Principles

1. **Visual language is preserved.** No palette, radius, spacing or typography changes beyond fixing drift and loading the intended font.
2. **Targeted, not a rewrite.** Each work item names the files it touches; anything not named is out of scope.
3. **Safety net first.** Lint + a real component test harness land before consolidation so refactors are verifiable.
4. **One way to do each thing.** Every primitive gets a short usage note in `docs/ui-conventions.md`, and lint rules enforce it where practical.
5. **Every item ships with its tests.** No work item is "done" without the listed unit/e2e coverage.

---

## Phase 0 — Guard rails ✅ (branch `ui/phase-0-guard-rails`)

Goal: make the codebase lint-clean and give the UI a test harness that mounts real Vuetify.

| ID | Work item | Files | Acceptance |
|----|-----------|-------|------------|
| 0.1 | **ESLint flat config**: `eslint-plugin-vue` (recommended), `@typescript-eslint` (recommended-type-checked on `.ts`), `eslint-plugin-vuejs-accessibility`, `eslint-plugin-import` (no cycles, ordered). Custom rules: forbid `VTooltip`, forbid `window.confirm`, forbid `!important` in `<style scoped>` via stylelint (below), forbid `: any` in `src-web` (warn initially, error after Phase 3). | `eslint.config.mjs`, `package.json` scripts `lint:ce`, `.github/workflows/ci.yml` | `npm run lint:ce` passes; CI runs it. |
| 0.2 | **Prettier** (`printWidth: 110`, single quotes, no semis — matching current style) + `prettier-plugin-organize-imports`. Reformat the minified SFCs (`base/SettingsMenu.vue`, `sites/settings/Notifications.vue`, `PDFOptions.vue`, `brand/*`, and the 23 files with >180-char lines). | `.prettierrc`, `.prettierignore`, affected SFCs | `prettier --check src-web` passes; diff is whitespace-only (verified by `git diff -w --stat` ≈ 0). |
| 0.3 | **Stylelint** (`stylelint-config-standard-scss`): `declaration-no-important` as *warn* with a baseline count; `selector-max-specificity`; no commented-out code. | `.stylelintrc.cjs` | Baseline `!important` count recorded (248); Phase 2 lowers the threshold. |
| 0.4 | **`vue-tsc --noEmit`** added to `type-check:ce` so SFC scripts are type-checked. Fix the errors it surfaces (expected: a handful around `any` and slot typing). | `apps/clearideas-ce/package.json`, `tsconfig.json` | CI green with SFCs type-checked. |
| 0.5 | **Component test harness**: `test/web/harness/mount.ts` exporting `mountWithVuetify(component, options)` that installs real Vuetify (theme + defaults + icon set from `plugins/vuetify`), `createRouter(createMemoryHistory())`, `createTestingPinia`, and registers `Tippy`/`v-tippy`. Add `vitest-axe` with an `expectNoA11yViolations(wrapper)` helper. Add `ResizeObserver`/`matchMedia`/`IntersectionObserver` polyfills once in `setup.ts`. | `test/web/harness/*.ts`, `test/web/setup.ts`, `vitest.web.config.ts` | A smoke test mounts `BaseButton` through the harness, asserts Vuetify classes are present and axe passes. |
| 0.6 | **Playwright matrix**: projects `desktop-light`, `desktop-dark`, `mobile-light` (390×844). Add `@axe-core/playwright` helper `expectPageAccessible(page)`. Add `test/e2e/helpers/ui.ts` with `signInViaForm`, `openSite`, `expectToast`. Keep the existing smoke spec green. | `playwright.config.ts`, `test/e2e/helpers/*.ts` | Existing smoke passes in all three projects. |
| 0.7 | **`docs/ui-conventions.md`** scaffold: sections for Tokens, Icons, Buttons, Dialogs, Empty states, Page header, Side-nav layout, Tooltips, Preferences, Testing. Filled in as each phase lands. | `docs/ui-conventions.md` | Exists; linked from `CONTRIBUTING.md`. |

---

## Phase 1 — P0 defects ✅ (branch `ui/phase-1-p0-defects`)

| ID | Work item | Files | Tests |
|----|-----------|-------|-------|
| 1.1 | **Load Inter.** Add `@fontsource-variable/inter` (self-hosted, AGPL-compatible OFL); import in `main.ts`; set `font-display: swap`; keep `"Inter", system-ui, sans-serif` stack. Remove the 6 scattered declarations in favour of one `$font-family-custom` + `--v-font-*`. Add `<link rel="preload">` for the woff2 in `index.html`. | `main.ts`, `index.html`, `styles/variables.scss`, `styles/vuetify/variables.scss`, `styles/libs/toastify.scss`, `styles/handlebars.scss` | e2e: `document.fonts.check('1em Inter')` is true after load (all projects). |
| 1.2 | **Icon map (Free).** Create `src-web/src/icons/index.ts` exporting a typed `ICONS` const (`ICONS.settings = 'fas fa-gear'` …) and a `registerIcons()` that imports only the used glyphs from `@fortawesome/free-solid-svg-icons` / `free-regular-svg-icons`. Replace Pro-only names: `sparkles→wand-magic-sparkles`, `files→copy` (or `folder-tree` for content), `bell-exclamation→bell`, `circle-envelope→envelope`, `sun-bright→sun`, `moon-stars→moon`, `spinner-third→spinner`, `books→book-open`, `cog→gear`. Normalise every `fasl|fass|fasds` prefix to `fas`/`far`. Unify concept glyphs (one "settings", one "home", one "refresh", one "search"; one role-icon set shared by `User.vue`, `UserDialog.vue`, `PDFOptions.vue`). Delete `fontawesome-compat.ts`; `FontAwesomeFreeIcon.vue` becomes a thin wrapper. Fix the 4 `mb-6`-inside-icon-name bugs. Set `VIcon` default `aria-hidden: true` and pass `aria-hidden="false"` + `aria-label` where an icon is meaningful. | `plugins/fontawesome.ts`, `plugins/vuetify/icons.ts`, `plugins/vuetify/FontAwesomeFreeIcon.vue`, `plugins/vuetify/defaults.ts`, new `icons/index.ts`, ~70 SFCs (mechanical replace) | Unit: every value in `ICONS` resolves in the FA library (`findIconDefinition` not null). Lint: regex rule forbids `fasl|fass|fasds` and raw `fa-` strings outside `icons/`. Bundle: `vite build --report` shows FA chunk < 150 kB. |
| 1.3 | **Accessible `IconCheckbox`.** Reimplement on `VCheckboxBtn` (true/false-icon props = current square icons, same sizes/colours) so it emits `update:modelValue` with a *new* array instead of mutating. Keep props (`id`, `label`, `description`, `size`, `width`, `disabled`) so call sites don't change. Label via `<label :for>`; description via `aria-describedby`. | `components/base/IconCheckbox.vue` | Unit: keyboard Space toggles; `role=checkbox`/`aria-checked` present; array model returns new array; axe clean. Snapshot of rendered markup for the 3 sizes. |
| 1.4 | **`useAppTheme` lifecycle.** Move system-theme watching into a single app-level initialiser (`App.vue`), remove `onBeforeUnmount` from the composable; `ThemeToggle` only reads/sets. | `composables/useAppTheme.ts`, `App.vue`, `layouts/components/ThemeToggle.vue` | Unit: mounting/unmounting `ThemeToggle` twice leaves one `matchMedia` listener registered. |
| 1.5 | **`StatusIcon` leak + `SettingsCard` attr leak.** Store the `$onAction` unsubscribe and call it on unmount; `SettingsCard` passes only `icon`/`store`/`action` to `StatusIcon`. | `components/base/StatusIcon.vue`, `components/base/SettingsCard.vue` | Unit: unsubscribe called on unmount; `VIcon` has no `title`/`subtitle` attrs. |

---

## Phase 2 — Design-system consolidation

| ID | Work item | Files | Tests |
|----|-----------|-------|-------|
| 2.1 | **Single token source.** Vuetify `theme.ts` is authoritative. `variables.scss` keeps only non-colour layout tokens (`--ci-navbar-height`, `--ci-border-radius`, shadows) and *derives* the few `--ci-*` colour aliases still needed from `--v-theme-*` (e.g. `--ci-surface: rgb(var(--v-theme-surface))`). Fix `--ci-ai-tools` (define in theme) and `--medium-emphasis-opacity` typo. Tokenise the `rgba(15,23,42,…)` shadows as `--ci-shadow-{sm,md,lg}` with dark-theme values. Update `theme-color` meta + add `color-scheme` on `.v-theme--dark`. | `styles/variables.scss`, `plugins/vuetify/theme.ts`, `styles/{navbar,vertical-nav,data-table,file-viewer,auth}.scss`, `SearchResults.vue`, `index.html`, `App.vue` | Unit: a token-parity test parses `theme.ts` and asserts no hard-coded hex in `styles/*.scss` other than `variables.scss`. e2e screenshot baselines (light/dark) for Sites, Site settings, File viewer — captured *before* this item, compared after; only intended diffs (font, drift fixes) accepted. |
| 2.2 | **Shrink `overrides.scss`.** Move what Vuetify exposes into `vuetify/variables.scss` / `defaults.ts` (button text-transform/letter-spacing/weight, field radius, card radius/shadow, table header, tab padding, list-item nav active colour). Delete the 60 lines of commented rules. Delete dead global selectors flagged by `report:ce-css-usage` (gradients.scss entirely, `.text-xs…2xl`, `.fs-*` after migrating the 10 usages to `text-caption`/`text-body-2`, `.gap-*` after migrating 4 usages to `ga-*`, `.ellipsis`→`text-truncate`, `.ci-detail-*`, `.ci-action-row`, `.text-gradient`, `.elevated-surface`, `.color-accent-*`). Remove `font-size.scss`, `gradients.scss`, `katex.scss` (empty), `dashboard.scss` (3 lines → `Dashboard.vue`). | `styles/*.scss`, `styles/main.scss`, ~15 SFCs | Stylelint `!important` threshold lowered to ≤ 120 (from 248). `report:ce-css-usage` reports 0 unused. Screenshot baselines unchanged. |
| 2.3 | **`BaseButton` v2.** Single template; explicit prop list forwarded to `VBtn` (no `{...props, ...attrs}` spread); `tooltip` via `v-tippy` directive instead of a duplicated wrapper; `icon`-only mode is exclusive with `text`. Add `intent: 'primary' | 'secondary' | 'tertiary' | 'danger'` that maps to (color, variant): primary→`primary/flat`, secondary→`secondary/tonal`, tertiary→`secondary/text`, danger→`error/flat`. Existing `color`/`variant` props still work (intent wins when set). Convert the 48 raw `<VBtn>` that are not icon-only toolbar buttons to `BaseButton`. | `components/base/BaseButton.vue`, consumers | Unit: renders each intent with expected classes; tooltip present only when prop set; no unknown attrs on `<button>`; axe clean; icon-only requires `aria-label` (prop-validator warns). |
| 2.4 | **`BaseDialog` v2 + migration.** Standard v-model (`modelValue` only); `actions` slot renders `VCardActions` with the divider and surface tint; new `confirmText/confirmIntent/cancelText/loading` props for the 80 % case that emit `confirm`/`cancel`; close button gets `aria-label="Close"`; `role="dialog"` + `aria-labelledby` title. Migrate all 9 consumers (+ `AgentsView` raw `VDialog`, + replace `window.confirm` in `AgentsView`). Convention: Cancel = tertiary, Confirm = primary, destructive Confirm = danger; order Cancel → Confirm. `DeleteSelectedDialog` no longer clears selection on Cancel. | `components/base/BaseDialog.vue`, `NewSiteDialog`, `FolderDialog`, `DeleteSelectedDialog`, `UserDialog`, `UserGroupDialog`, `NewUserDialogContainer`, `NewAccessKey`, `RenameMenuItem`, `ContentItemMenu`, `AgentsView` | Unit: open/close via v-model, Escape, close button; confirm/cancel emit; loading disables confirm; axe clean. e2e: create-site and delete flows via the real dialogs. |
| 2.5 | **`EmptyState` primitive.** One component (`icon`, `title`, `text`, optional `actions` slot) wrapping `VEmptyState` with the app's sizing. Replace the 4 dedicated empty-state components, the 5 inline `VEmptyState`s and the `.ci-empty-state-block` variant. Add CTAs: *New site* (Sites/all, Sites/owned), *New folder* + *Upload* (Content, honouring `canEditContent`), *Add user* (Users — already has). Delete the unreachable `BookmarksEmptyState`. | new `components/base/EmptyState.vue`, 10 call sites | Unit: renders CTA slot; axe clean. e2e: empty workspace shows *New site* CTA and it opens the dialog. |
| 2.6 | **`PageHeader` primitive.** Props `title`, optional `breadcrumbs`, `actions` slot; renders a visually-hidden or visible `<h1>`, sets `document.title` (`"{title} · Clear Ideas CE"`) via a tiny `usePageTitle()`. Applied to Sites, Users, Agents, Analytics, Settings, Site, File views. `Breadcrumbs` becomes `<nav aria-label="Breadcrumb"><ol>` with `aria-current="page"` on the last item. | new `components/base/PageHeader.vue`, `composables/usePageTitle.ts`, `components/sites/Breadcrumbs.vue`, 7 views | Unit: h1 + title set; breadcrumb semantics; axe clean. e2e: `expect(page).toHaveTitle(/Sites · /)` per route. |
| 2.7 | **`SideNavLayout` primitive.** One component (`items` with headings/groups, `modelValue` selected key, rail collapse ≤ 959 px with tippy labels, default slot for content) replacing `base/SettingsMenu.vue`, `settings/SettingsMenu.vue` and the inline list in `AnalyticsView`. Move the generic layout CSS out of `settings.scss` into the component's scoped style; `settings.scss` shrinks to card-content typography only. Remove the repeated "shadow-zone" negative-margin blocks from `FileView`/`SitesView`/`SiteView`/`UsersView`/`AnalyticsView` in favour of a single `.page-scroll` utility with `overflow-clip-margin`. | new `components/base/SideNavLayout.vue`, `components/sites/Settings.vue`, `views/SettingsView.vue`, `views/AnalyticsView.vue`, `styles/settings.scss`, `styles/content.scss`, 5 views | Unit: keyboard navigation of items, active state, rail mode renders tooltips; axe clean. e2e: settings/site-settings/analytics nav on desktop and mobile. |
| 2.8 | **Single `Avatar`, single `SettingsMenu`.** Keep `brand/Avatar.vue` behaviour (two-letter initials, hashed colour, `aria-label` name); delete `base/Avatar.vue`; update `User.vue`. (`SettingsMenu` removal is part of 2.7.) | `components/brand/Avatar.vue` → `components/base/Avatar.vue`, `User.vue`, `NavUserProfileMenu.vue` | Unit: initials/colour determinism; axe. |
| 2.9 | **Accessible row & menu controls.** `SiteItemMenu`/`ContentItemMenu`/`UserItemMenu` activators become `BaseButton` icon-only (`aria-label="More actions for {name}"`, `aria-haspopup="menu"`). `SiteInfoIcons` favourite/visibility/users become icon buttons with labels and `aria-pressed` for favourite. `TableFooter` pagination buttons get labels; page-size `VSelect` gets `aria-label`. Restore tab focus ring (replace the `.v-tab .v-btn__overlay{opacity:0}` override with a `:focus-visible` outline). Add global `:focus-visible` token style and `prefers-reduced-motion` media query disabling the search morph/nav transitions. `SearchResults` resize handle gets `role="separator"`, `aria-orientation`, `tabindex=0`, arrow-key resizing, and `maxWidth` recomputed on resize. Footer text raised to ≥ 4.5:1. | listed components, `styles/overrides.scss`, `styles/misc.scss`, `Footer.vue` | Unit (axe) on each; keyboard tests: Tab reaches every control, Enter/Space activates, arrow keys resize. e2e axe scan on Sites/Site/Users/Settings pages reports 0 serious/critical. |
| 2.10 | **Tooltip consolidation.** `plugins/tippy.ts` with app defaults (placement `top`, delay `[300,0]`, `theme: 'ci'`, `touch: ['hold', 500]`); single `.tippy-box[data-theme~='ci']` style block using theme tokens; remove `scale.css`/`svg-arrow.css` imports if unused after audit; lint rule forbids `VTooltip`. | `main.ts`, new `plugins/tippy.ts`, `styles/libs/tippy.scss`, `styles/main.scss` | Unit: a `BaseButton` with `tooltip` shows tippy content on focus (keyboard) as well as hover. |
| 2.11 | **Package `BasePDFViewer`.** (Decision: keep as a workspace package; it will be extracted to its own repository later.) Move to `packages/clearideas-pdf-viewer/` (`src/BasePDFViewer.vue`, `src/index.ts`, `README.md`, own `package.json` with `vue`, `vuetify`, `pdfjs-dist` as peer deps). Replace the stub `t()` with a `labels` prop (typed, defaulted); remove `suppressViewerEvent`; `PDFEmbed.vue` imports from the package. Add to workspaces and `check:import-boundaries`. No other internal changes. | `packages/clearideas-pdf-viewer/*`, `components/files/PDFEmbed.vue`, root `package.json`, `scripts/check-import-boundaries.mjs` | Unit (package): mounts with a 1-page fixture PDF (pdfjs mocked), emits `document-open`/`page-change`/`zoom-change`, toolbar buttons have labels, axe clean on toolbar. e2e: file viewer opens a PDF and page nav works (existing fixture in seed). |

---

## Phase 3 — Usability fixes

| ID | Work item | Files | Tests |
|----|-----------|-------|-------|
| 3.1 | **Primary-action hierarchy.** `NewSite`, `NewFolder`, `DropZone` (button mode), `NewUser`, `NewAccessKey` default to `intent="primary"`; toolbar utilities (`ToggleTiles`, `Refresh*`, `DeleteSelected`) to `tertiary`. Login: submit = primary, "Use different email" = tertiary. Dialog CTAs per 2.4 convention. | action components, `LoginView.vue` | Unit: default intent snapshot per component. e2e screenshot baselines updated with reviewed diffs. |
| 3.2 | **`usePreferences()`.** Keys: `tileView`, `sitePageSize`, `userPageSize`, `theme`, `navRail`, `searchResultsWidth`. Read localStorage synchronously on boot; after `getProfile()` merge `attributes.ui` (server wins), write-through on change (debounced PATCH, silent). `profileStore` exposes them as computed over the composable; `useAppTheme` migrates to it. | new `composables/usePreferences.ts`, `stores/profile.store.ts`, `composables/useAppTheme.ts`, `AppLayout.vue`, `SearchResults.vue` | Unit: boot with localStorage only; server merge precedence; PATCH called once per change burst. API test: profile PATCH round-trips `attributes.ui`. e2e: toggle tiles, reload, still tiles. |
| 3.3 | **Shared filter/sort composables + tile parity.** `useContentFilters()` (state + `applyFilters(items)` + `applySort(items)` + `reset()`) and `useSiteFilters()`; `SiteView` holds one composable instance and passes it via `provide/inject` (or a scoped Pinia store) — the 33 `v-model:*` bindings go away. `ContentTiles`/`SiteTiles` get `TableFooter` pagination and a compact sort menu (reusing `ContentActions` filter UI); `useGhostItems` used by both tile views (drop the hard-coded `% 4`). Remove `formatItemWithPreset`, `contentLevel`, `bookmarks` branches, `dismissHero`/`interactionsArmed`, unused `BaseTabs` props, `prependIcon` on tabs (or render it), `TagOverflowRow` either implements `maxVisibleChars` with a "+N" chip or drops the prop. | new `composables/useContentFilters.ts`, `useSiteFilters.ts`; `SiteView`, `SitesView`, `UsersView`, `ContentActions`, `ContentList`, `ContentTiles`, `SiteList`, `SiteTiles`, `BaseTabs`, `TagOverflowRow` | Unit: filter/sort composables (table-driven cases for name/mime/size/date/sort); `ContentList` and `ContentTiles` mounted with the same fixture show identical item order and count; pagination in tiles. e2e: filter → switch view → same results. |
| 3.4 | **Fix double loads.** Single `immediate` watcher per view (drop the redundant `onMounted`); `ContentList`/`ContentTiles` stop calling `setCurrentSite` (parent owns it) and only set `activeFolderId`. Add a request-dedupe guard in `siteStore.setCurrentSite` (same id + in-flight → return the pending promise). | `SiteView.vue`, `ContentList.vue`, `ContentTiles.vue`, `FileView.vue`, `stores/site.store.ts` | Unit: navigating to a site triggers `ceApi.site` exactly once (store contract test extended). |
| 3.5 | **Destructive actions.** "Block site" → `BaseDialog` confirm + success toast with *Undo* action (calls `toggleSuppressedSites`). Bulk delete → `Promise.allSettled` in batches of 4 with a progress line in the dialog ("Deleting 3 of 12…") and a summary toast on partial failure. | `SiteItemMenu.vue`, `DeleteSelectedDialog.vue`, `stores/content.store.ts`, `composables/useAlert.ts` (action-button support) | Unit: confirm required; undo restores; partial failure surfaces count. e2e: block → undo. |
| 3.6 | **Copy & content consistency.** Single `config/roles.ts` (title, description, icon) consumed by `User.vue`, `UserDialog.vue`, `PDFOptions.vue`, `AddUserToGroup.vue`. Site ID in General settings → `VTextField readonly` + copy button (remove `MarkdownRenderer` use and negative margins). Remove the redundant "CE" chip in the profile menu. Footer "API health" → opens `/api/health` only in dev, otherwise hidden. | `config/roles.ts`, listed components, `General.vue`, `NavUserProfileMenu.vue`, `Footer.vue` | Unit: role table is the single source (import assertion); copy button writes clipboard. |
| 3.7 | **Forms.** `SettingsCard` gains `dirty`/`saving` props: Save buttons disabled until dirty, `beforeRouteLeave`/`beforeunload` guard when dirty (via a `useUnsavedChanges()` composable). Inline `VAlert` errors move inside the card. Analytics `FilterBar` date inputs → Vuetify `VTextField type="date"` styled like the other fields (keeps native picker). | `SettingsCard.vue`, `SettingsView.vue`, `sites/settings/*.vue`, `analytics/FilterBar.vue`, new `composables/useUnsavedChanges.ts` | Unit: dirty tracking; guard prompts on navigation; FilterBar renders Vuetify fields. e2e: edit site name → navigate away → prompt. |
| 3.8 | **Active sessions (real data).** Add `ceApi.listSessions()/revokeSession(token)/revokeOtherSessions()` against Better Auth endpoints; render device (`userAgent` parsed with a tiny helper), IP, created/expires, *Current* chip; "Sign out other sessions" action. Fallback: if the endpoints 404 in the API test, delete the section instead. | `api/client.ts`, `views/SettingsView.vue` → extracted `components/settings/ActiveSessions.vue` | API test: list/revoke through the CE app. Unit: renders list, current chip, revoke confirm. |
| 3.9 | **Search discoverability (keeping `HandlebarsTextarea`).** Desktop ≥ 960 px: search is always expanded at 420–600 px with placeholder and a trailing `⌘K` kbd hint; mobile keeps the collapse-to-icon behaviour. Wrap the editor in `role="search"` with a visually-hidden label; `HandlebarsTextarea` root gets `role="textbox"`, `aria-multiline="false"`, `aria-placeholder`. Results drawer gets a loading skeleton and `aria-live="polite"` summary. | `NavSearchBar.vue`, `HandlebarsTextarea.vue` (attrs only), `SearchResults.vue` | Unit: `HandlebarsTextarea` contract test — typing `@contentType:application/pdf` produces a highlight span, Enter emits search, `hasIncompleteMetadataToken` blocks submit; axe clean. e2e: type query → results → open result. |
| 3.10 | **Split `SettingsView`.** Extract `ProfileSettings.vue`, `NotificationSettings.vue`, `ActiveSessions.vue`, `AccessKeys.vue`; view becomes routing + `SideNavLayout`. Remove inline `style` attributes (43 across the tree) into scoped classes as files are touched. Add `/agents` to `AppLayout.active`. | `views/SettingsView.vue`, new `components/settings/*.vue`, `AppLayout.vue` | Unit per extracted component (render, save payload). |
| 3.11 | **Typing pass.** Replace `ContentItem = any`, `headers: any[]`, `navItem: any`, `item: any` with `types/domain.ts` types (`FileItem | Folder`, `Site`, `SiteUser`, `NavMenuItem`, `DataTableHeader`). Turn the `no-explicit-any` lint rule to *error* for `src-web`. | ~20 SFCs, `types/domain.ts`, `eslint.config.mjs` | `vue-tsc` + lint green with the rule at error. |

---

## Phase 4 — Test coverage & release

| ID | Work item | Tests |
|----|-----------|-------|
| 4.1 | **Primitive suite** (Vuetify-mounted, axe): `BaseButton`, `BaseDialog`, `BaseTabs`, `BaseActions`, `EmptyState`, `PageHeader`, `SideNavLayout`, `SettingsCard`, `IconCheckbox`, `TableFooter`, `Tag`, `TagOverflowRow`, `CompactInlineSelector`, `Avatar`, `StatusIcon`, `Breadcrumbs`. | One spec per primitive; snapshot of default render; interaction; axe. |
| 4.2 | **Feature suite**: `ContentList`, `ContentTiles`, `SiteList`, `SiteTiles`, `User`, `UserGroups`, `NavSearchBar`+`SearchResults`, `VerticalNav`+`Navbar`, `ThemeToggle`, `DropZone` (file dialog + drop events), all dialogs, `LoginView` (email→code→redirect), `ProfileSettings`, `NotificationSettings`, `AccessKeys`, `ActiveSessions`, `sites/settings/*`, `AnalyticsView`+`Dashboard`+`FilterBar`, `Schedule`, `TimeZone`, `FileView`+`FileViewer` (viewer selection by content type). | Fixtures in `test/web/fixtures/`; `createTestingPinia` with typed initial state; router-driven tests for tab routes. |
| 4.3 | **Playwright UI journeys** (3 projects): sign in via form → empty-state *New site* → dialog → site page → *New folder* → upload via drop zone (`setInputFiles`) → select two → delete → search `@contentType:` → open result → Properties tab → PDF viewer page nav → toggle tiles → toggle theme → rail collapse → Settings: profile save, notification save, access key create/revoke, active sessions → mobile drawer open/close → sign out. Axe scan on each page. Screenshot baselines for the 6 README views in light + dark. | `test/e2e/ui-journeys.spec.ts`, `test/e2e/visual.spec.ts`, `test/e2e/__screenshots__/`. |
| 4.4 | **Coverage gates.** `vitest.web.config.ts` thresholds: lines 70 % / branches 60 % for `src-web/src/components` and `views` (excluding the vendored viewer); CI fails below. Add `test:ce:web` and `test:ce:e2e` to the required checks. | CI config. |
| 4.5 | **Docs & screenshots.** Regenerate `docs/screenshots/*.png` from `visual.spec.ts` with correct names; fix README references; finalise `docs/ui-conventions.md`; CHANGELOG entry. | — |

---

## Sequencing (revised after Phase 1)

Phases 0 and 1 are merged. With a working local toolchain (Vitest, `vue-tsc`, lint, `vite build`) but
no browser or MongoDB in the implementation sandbox, the remaining work is re-sequenced by
**verifiability** rather than by theme. Item numbers above are unchanged.

| Batch | Items | Verification |
|-------|-------|--------------|
| **A — primitives & a11y** ✅ merged | 2.3 `BaseButton` intent · 2.4 `BaseDialog` v2 + migrations · 2.5 `EmptyState` with CTAs · 2.6 `PageHeader` / `document.title` / semantic breadcrumbs · 2.9 accessible row/menu controls + focus rings · 2.10 tippy consolidation · 2.11 package `BasePDFViewer` · 3.4 double loads · 3.6 copy/roles · **2.12 (new) route-level lazy loading** | Vuetify-harness tests + axe, `vite build`, lint/type gates — all run in the sandbox. Browser check by reviewer: button hierarchy, dialogs, empty-state CTAs. |
| **B — behaviour (sandbox-verifiable)** ✅ complete (branch `ui/batch-b-behaviour`; API suite and e2e matrix green on the reviewer's machine) | 3.2 preferences · 3.3 filter composables + tile/list parity · 3.5 destructive-action UX · 3.7 forms/dirty state · 3.9 search discoverability · 3.10 `SettingsView` split · 3.11 typing ratchet | Same as A, plus store/composable unit tests. |
| **C — visual consolidation** ✅ (branch `ui/batch-c-and-a11y`) | 2.1 tokens · 2.2 `overrides.scss` shrink + dead CSS · 2.7 `SideNavLayout` · 2.8 `Avatar` · dead code | Sandbox: before/after screenshot diffs of 28 states × 3 projects against the built app. `test/e2e/visual.spec.ts` (13 screens × light/dark/mobile) landed with Batch B. Reviewer captures baselines once on merged Batch B with `npm run test:ce:visual:update` and commits `test/e2e/__screenshots__`, then approves the diff per change with `npm run test:ce:visual`. |
| **3.8 Active sessions** ✅ | Step 1 — `test/api/auth-sessions.test.ts` passes: list / revoke-by-token / revoke-others are reachable through the CE API. Step 2 — the card shows real sessions (`active-sessions.test.ts`). | API test (done) + component test for the card. |

### 2.12 (new) Route-level lazy loading

`router/index.ts` imports every view eagerly, so the login page downloads the PDF viewer, highlight.js,
markdown-it, the agents UI and the AI SDK (main chunk 3.06 MB after the icon registry; 4.60 MB before).
Views become `() => import(...)`; the PDF viewer package (2.11) and `MarkdownRenderer`'s highlighter become
their own chunks. Acceptance: login-route chunk < 600 kB; `vite build` chunk-size warning gone; e2e smoke
unchanged. Test: a build-output size assertion in `test/web/bundle-budget.test.ts` (reads `web/assets`
when present).

### Phase 4 rebalanced

Breadth of coverage comes from Vuetify-mounted component tests (runnable in the sandbox). Playwright is
reserved for flows that genuinely need a browser: sign-in form, upload via drop zone, PDF viewer, mobile
drawer, axe page scans, visual baselines. Coverage thresholds (4.4) apply to the web unit suite.

### Visual baselines — reviewer workflow (Windows-friendly)

```
npm run test:ce:visual:update   # first time, or after approving an intended change
npm run test:ce:visual          # compare; opens the HTML report on failure
```

Both scripts build the web app, start the in-memory server and run only the `@visual`-tagged spec
(`test/e2e/visual.spec.ts`) in the `desktop-light`, `desktop-dark` and `mobile-light` projects. Baselines live in `test/e2e/__screenshots__/` and are
committed. No manual server or browser setup is required beyond `npx playwright install chromium` once.

## Status and how to resume (after Batch C, branch `ui/batch-c-and-a11y`)

Phases 0–4 are done. Everything below was verified in the implementation sandbox, including the full
API suite and the server-backed Playwright matrix (see *How this branch was verified*). Only the
committed visual baselines remain, to be captured on the team's OS.

### Done

| Scope | Outcome |
|-------|---------|
| Phase 0 | Lint/format/type toolchain, conventions ratchet, Vuetify test harness with axe, Playwright matrix. |
| Phase 1 | Inter loaded, FontAwesome Free registry, accessible checkboxes, theme/listener leaks fixed. |
| Batch A | `BaseButton` intents, `BaseDialog` v2, `EmptyState`, `PageHeader`/titles/breadcrumbs, accessible row/menu/pagination controls, tippy, `@clearideas/pdf-viewer`, lazy routes, role copy, double loads. |
| Batch B | Preferences, shared filters + tile pagination, destructive-action UX, dirty forms + guard, `SettingsView` split, search discoverability, `any` 68 → 0, `visual.spec.ts`. |
| 3.8 step 2 ✅ | `ActiveSessions` lists Better Auth sessions (device, IP, last active), revoke one / all others with confirmation; `ceApi.listSessions/currentSession/revokeSession/revokeOtherSessions`. |
| 4.1 ✅ | `primitives.test.ts` (+ existing primitive specs): every primitive rendered, operated by keyboard, axe-checked. |
| 4.2 ✅ | Feature specs for sites, site content, site users, settings, site settings, users, analytics, login, search, file view, app shell, agents, media/branding/chat — whole app mounted per route against an in-memory fake API (`test/web/fixtures`). The defects they found are fixed (listed in CHANGELOG). |
| 4.4 ✅ | Coverage gates in `vitest.web.config.ts` (components/views 70 % lines, 60 % branches; measured ~80/65 and ~92/79; whole web suite 81 % lines, was 34.5 %). CI runs `test:ce:web:coverage`. |
| Real-browser a11y pass | axe (WCAG 2.0/2.1/2.2 A+AA + best practice) in Chromium on 26 pages + 8 dialog/menu/form states × light/dark/mobile: 0 serious/critical, and no moderate findings except `region` on open menus (the pre-change build failed 19 of 21 pages). Light semantic colours darkened, dark theme uses dark text on fills, warning is fill-only; pinned by `theme-contrast.test.ts`. The e2e helper now includes the WCAG 2.1 rule set (it was missing; *Label in Name* findings fixed). pdf.js switched to its legacy build (the modern build fails to render in Chromium 145). |
| 2.1 ✅ | One colour source; shadow tokens; `color-scheme`; `token-parity.test.ts`. |
| 2.2 ✅ | `font-size.scss`, `gradients.scss`, `katex.scss`, `dashboard.scss` and dead utilities removed; `overrides.scss` rewritten; element defaults moved into the `ci-base` cascade layer; `!important` 248 → 40 (SFCs: 1, with a reason; stylelint now errors on `!important` in SFCs); `report:ce-css-usage` 0 unused. |
| 2.7 ✅ | `SideNavLayout` replaces both `SettingsMenu`s and the Analytics menu; layout CSS moved out of `settings.scss`; `.page-bleed` utility replaces per-view negative margins. |
| 2.8 ✅ | One `components/base/Avatar.vue` (initials, deterministic colour, decorative unless `label`). |
| Dead code | `latestContents`/`bookmarksWithIcons`, `display="latest"`, unused `siteName` props, `latest`/`bookmark` slots, `.settings-status-item`, `rail-mode-is-on`. |
| 4.3 ✅ | `test/e2e/ui-journeys.spec.ts` (workspace, settings, mobile journeys) and 13 seeded-page scans in `ui-a11y.spec.ts`, green on the real server in all three projects. The first run found two harness defects, now fixed: the server listened on a different origin than the runtime was configured for (Better Auth rejected "revoke session" with *Invalid origin*), and second users were not invited (CE admits only the first sign-up). |
| Beyond the plan (found by the sandbox checks) | Keyboard access to rows and tiles (`ItemLink`), section navs and search results as links, dialog focus return, manifest-editor keyboard trap, "site/file not available" states, invisible icon buttons on phones, *Label in Name*, landmarks, heading levels, warning/favourite contrast — see CHANGELOG. |
| 4.5 ✅ | `test/e2e/readme-screenshots.spec.ts` + `npm run docs:ce:screenshots` regenerated `docs/screenshots/ce-*.png` (1600 × 1000) from a seeded real server, under the names README uses (the old files were shuffled, U13). |

Ratchet: `!important` 40 · explicit `any` 0 · inline `style=""` 9 · long lines 0 · unnamed progress 0.
Suites: unit 96 · API 15 · web 350 (82 % lines) · e2e 55 (+4 project-specific skips) · visual 39.
After Ask (below): unit 103 · API 24 · web 356 (81 % lines) · e2e 64 (+4) · visual 42.

### How this branch was verified

Node 24.21, MongoDB 8.2.6 (`MONGOMS_SYSTEM_BINARY`), `@clearideas/agent-runtime` 0.4.1 (0.6.0 after Ask) from the
reviewer's tarballs, Playwright 1.58 / Chromium 145:

- every CI step except `npm ci` (sandbox lockfile), `npm audit` (no audit endpoint) and the Docker build:
  type-checks (core, CE, web), import boundaries, route validation, hygiene, `check:ce-ui`, ESLint,
  Stylelint, Prettier, unit, API, web with coverage, e2e; plus `report:ce-css-usage`;
- `test:ce:visual:update` then `test:ce:visual`: the visual spec is stable (39/39 on re-run). The Linux
  baselines were not committed (font rendering differs per OS);
- before the packages arrived, a real browser against the **built** app served with the web suite's fake
  API: axe scans (same tags and policy as `helpers/ui.ts`) of 34 states × 3 projects,
  pixel diffs of the same screenshots before/after every change, scroll/sticky probes of the side-nav
  layouts, a dry run of the journey steps, and checks axe does not cover: keyboard walkthroughs (Tab
  order, dialog focus return, no traps), icon-button contrast, 320–390 px reflow, forced colours,
  WCAG 1.4.12 text spacing and reduced motion.

### To resume — in this order

1. `npx --yes npm@11.14.1 install` on a normal registry and commit the regenerated `package-lock.json`.
2. **Visual baselines:** capture on the OS the team compares on with `npm run test:ce:visual:update`
   and commit `test/e2e/__screenshots__/` (the sandbox confirmed the spec is stable).
3. Open items: none known from the review. Findings that came up during this branch and were fixed
   are in the CHANGELOG (headings in settings cards, warning-chip contrast, phone layout of the
   "Unsaved changes" marker, agent schedule time zone, shared-site icon size).

### Notes carried forward

- The smoke spec was tightened to semantic locators (breadcrumb link, selected tab, search landmark).
  New e2e assertions should follow that pattern rather than `getByText(...).first()`.
- The reviewer's regenerated `package-lock.json` must be committed with the merge (root `overrides`
  prevents regenerating it offline in the implementation sandbox).

## Ask — chat on the agent runtime (after the remediation, same branch)

Requested after Phase 4. Decisions (product owner):

| Topic | Decision |
|-------|----------|
| Scope | Same site access rules as the rest of the app, plus AI chat turned on per site. Ask covers every such site, or one chosen at the start of a conversation. |
| Storage | Conversations are stored server-side per user (`CeChatConversation`); the browser sends only the new question. |
| Site AI tab | Uses the new engine and keeps its conversations (listed under Ask too). |
| Models | `AI_CHAT_MODEL`/`AI_CHAT_MODELS` stay separate from `AI_AGENT_MODEL`. |
| Retrieval | The existing keyword/full-text search; no embeddings. |
| Navigation | New "Ask" sidebar item (`/ask/:conversationId?`). |

What was built:

- Server: `services/content-tools.ts` (list/metadata/search/read incl. PDF text, access-checked per call; shared with the agents' Site tools), `services/chat/` (`ChatService` = `AgentRuntime` + one prompt step per turn, `ChatToolAdapter`, model allow-list), `models/chat.ts`, `controllers/chat/chat.controller.ts` + `routes/chat/chat.routes.ts` (AI SDK UI message stream: transient `data-conversation`/`data-status`, persisted `data-sources`). The old `POST /api/sites/:siteId/chat` AI SDK loop is removed. Contracts: `ChatTurnRequestSchema` & co. in contracts-core.
- Web: `components/chat/ChatPanel.vue` (shared), `views/AskView.vue` (history list / phone History menu, scope select, rename/delete), `SiteChat.vue` rewritten on `ChatPanel`.
- Fixed on the way: the chat/agent/analytics rate limiters were mounted without a path and counted every later `/api` request; e2e servers raise the auth limit (a spec signs in dozens of times).
- Agent runtime 0.6.0 (was 0.4.1); manifests with runtime `workspaces` are rejected. Upstream issue, still present in 0.6.0: `@clearideas/agent-runtime-model-ai-sdk` rejects the `custom` content part (`anthropic.message_start`) that `@ai-sdk/anthropic` ≥ 4.0.72 adds to every streamed response; `@ai-sdk/anthropic@4` is pinned to 4.0.71 in root `overrides` until a runtime release skips `custom` parts (patch prepared for the agent-runtime repository).

Tests: `test/api/chat.test.ts` (9: scope and access rules, streaming, sources, storage/ownership, site deletion, instruction-leak refusal, validation, rate-limit scoping) with the scripted `FakeChatModel`; `test/unit/ai-tool-schemas.test.ts` (tool schemas through the real OpenAI/Anthropic provider code, stubbed `fetch`); `test/web/feature-ask.test.ts` (10) and the Site AI feature tests; e2e Ask journey (all three projects), Ask/Ask-conversation axe scans, Ask visual baseline and README screenshot (`ce-ask.png`).

Follow-ups (not done): a runtime token budget needs provider usage reporting (OpenAI-compatible local models may not report it); conversations of the old browser-only site chat are not migrated; there is no retention period for stored conversations (deleting a site deletes its site conversations; conversations across sites stay until their owner deletes them).

## Relative sizing

| Phase | Size | Notes |
|-------|------|-------|
| 0 | S–M | Mostly config; the reformat diff is large but mechanical. |
| 1 | M | 1.2 touches ~70 files mechanically; 1.3 is the only non-trivial rewrite. |
| 2 | L | Largest phase; each primitive is small but the migrations fan out. Land as one PR per item. |
| 3 | M–L | 3.3 and 3.10 are the meaty ones. |
| 4 | M | Volume of specs; patterns are established by then. |

## Risks & mitigations

- **Visual regression while consolidating CSS** → screenshot baselines captured before 2.1; every Phase 2 PR includes the diff review.
- **Icon replacement changes meaning** (e.g. `sparkles`→`wand-magic-sparkles`) → single `ICONS` map makes later swaps one-line; review the map as a group.
- **`vue-tsc` surfacing many errors** → run it in 0.4 as a report first, fix in the same PR only what blocks; the rest ride with 3.11.
- **Better Auth session endpoints behind CE middleware** → 3.8 starts with the API test; the removal path is pre-agreed.
- **Preference sync conflicts** (two tabs) → server wins on load, last-write-wins on PATCH; acceptable for UI prefs.

## Out of scope (explicitly)

- Internal refactor of `BasePDFViewer` beyond packaging and the `labels` prop.
- Replacing `HandlebarsTextarea` or `vue-tippy`.
- Palette/typography/spacing redesign; new features; backend changes other than the sessions wiring in 3.8 and the `attributes.ui` usage in 3.2.
