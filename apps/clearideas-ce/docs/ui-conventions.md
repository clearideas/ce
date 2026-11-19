# CE UI Conventions

How the Clear Ideas CE web UI (`apps/clearideas-ce/src-web`) is built. Each section states the
convention, the primitive that implements it, and the check that enforces it. Sections marked
_(Phase N)_ are filled in when the corresponding item in `ui-remediation-plan.md` lands.

The visual language (light low-chroma surfaces, blue primary, pill buttons, Inter) is a given;
these conventions exist so that every screen expresses it the same way.

## Tooling

| Check | Command | Enforces |
|-------|---------|----------|
| ESLint | `npm run lint:ce` | Vue/TS rules, `vuejs-accessibility`, no `VTooltip`, no `window.confirm/alert/prompt` |
| Prettier | `npm run format:ce:check` / `npm run format:ce` | Formatting (`printWidth` 110, no semicolons, single quotes) |
| Stylelint | `npm run lint:ce:styles` | SCSS/`<style>` hygiene; `!important` warnings |
| `vue-tsc` | `npm run type-check:ce:web` | Type-checks SFC `<script>` blocks (plain `tsc` does not) |
| UI conventions ratchet | `npm run check:ce-ui` | Budgets in `scripts/ce-ui-conventions.baseline.json`: Pro icon prefixes, Pro-only icon names, `!important`, explicit `any`, inline `style=""`, lines > 160 chars, native dialogs. Counts may only go down; lower the baseline with `--update-baseline` when you reduce one. |

Run `npm run check:ce-ui --verbose` to list every occurrence for a rule.

## Typography

- Inter is self-hosted via `@fontsource-variable/inter` (imported once in `main.ts`). The family stack lives in one place per language: `--ci-font-family` (`styles/variables.scss`) for CSS and `$font-family-custom` (`styles/vuetify/variables.scss`) for Vuetify SASS. Never write a `font-family` literal elsewhere.

## Tokens _(Phase 2.1)_

- Vuetify's theme (`src-web/src/plugins/vuetify/theme.ts`) is the single source of colour.
  Use `rgb(var(--v-theme-*))` / `rgba(var(--v-theme-*), alpha)` in styles and `color="..."` props in templates.
  The few `--ci-*` colour aliases in `styles/variables.scss` (`--ci-surface`, `--ci-on-surface`,
  `--ci-background`, `--ci-panel-surface`) are *derived* from the theme, never literals.
- Non-colour tokens live in `styles/variables.scss`: `--ci-font-family`, `--ci-navbar-height`,
  `--ci-border-radius`, and the shadows `--ci-shadow-{sm,md,lg,side,tooltip}` (with dark-theme values).
  Never write an `rgba(15, 23, 42, …)`-style shadow literal.
- Do not add hard-coded hex/rgba colours to SCSS or `<style>` blocks (`test/web/token-parity.test.ts`
  fails on them and on any `--v-theme-*` name that is not defined in both themes). Avatar colours are the
  only palette outside the theme (`config/avatar.ts`, contrast-tested).
- Semantic colours are chosen to work as text, as fills (with their `on-*` colour) and as tonal
  chips/alerts in both themes; `test/web/theme-contrast.test.ts` pins every pair at ≥ 4.5:1. Changing a
  theme colour means running that test, not eyeballing it.
- `warning` (amber) is a fill colour only: warning chips and alerts use `variant="flat"` (dark text on
  amber); tonal/outlined/text variants would draw ~2:1 amber text (also enforced by that test).

## CSS layering and `!important` _(Phase 2.2)_

- Vuetify 4 ships its CSS in cascade layers (order declared in `index.html`); our stylesheets are
  unlayered, so a plain declaration already beats any Vuetify component or utility rule — `!important`
  is not needed to override Vuetify, including inside `:deep()`.
- Element defaults (`p` spacing, `a` decoration) live in the `ci-base` layer (`styles/overrides.scss`),
  just above Vuetify's reset: Vuetify utilities (`mb-0`, …) and every component's own rules override
  them.
- `!important` is allowed only where a rule must beat an inline style set by Vuetify (e.g. the
  toolbar's height), an unlayered third-party stylesheet (`styles/libs/toastify.scss`), or our own
  utility classes (`styles/utilities.scss`), and for the reduced-motion override. Each use carries a
  comment saying which. Budget: `check:ce-ui` `important-budget` (248 → 40).
- Prefer Vuetify's SASS variables (`styles/vuetify/variables.scss`) and defaults
  (`plugins/vuetify/defaults.ts`) to global overrides.
- Pages that let cards' shadows run into the gutter use the `.page-bleed` utility
  (`--ci-page-bleed`, default 8 px) instead of hand-written negative margins.

## Icons

- FontAwesome **Free** only. Use `fas` (solid) or `far` (regular); Pro prefixes (`fasl`, `fass`, `fasds`) and Pro-only names fail `check:ce-ui`.
- Recurring concepts go through `ICONS` / `ROLE_ICONS` in `src-web/src/icons/index.ts` (`ICONS.settings`, `ICONS.refresh`, `ROLE_ICONS.editor` …) so the same idea always gets the same glyph. One-off decorative icons may be inline `'fas fa-<name>'`.
- Every glyph must be imported in `src-web/src/icons/registry.ts` — only those are bundled. `test/web/icons.test.ts` scans the source, the site icon picker and the content-type map and fails on anything unregistered (an unregistered icon renders as an empty SVG with no error).
- Names that may still arrive from persisted data (old site icons) or the vendored PDF viewer are mapped in `icons/resolve.ts` (`LEGACY_ICON_ALIASES`); do not add source-code usages there.
- Icons are decorative by default (Vuetify sets `aria-hidden` unless the icon is interactive). An icon that is the only content of a control needs an `aria-label` on the control, not on the icon.

## Bundles

- Views other than Login/Sites are lazy routes (`() => import(...)` in `router/index.ts`). Keep heavy dependencies (pdf.js, markdown/highlighting, the AI SDK) out of the entry chunk; `test/web/bundle-budget.test.ts` enforces sizes when a build is present.
- Vuetify components are auto-imported per SFC by `vite-plugin-vuetify`; never register `vuetify/components` globally. Components must be used by tag name in templates (no `<component :is="'VBtn'">`).
- Syntax highlighting goes through `utils/highlight.ts` (curated grammars), never `import hljs from 'highlight.js'`.
- The PDF viewer lives in `packages/clearideas-pdf-viewer` and is used only via its public API (`BasePDFViewer` props/events/labels).

## Buttons

- Use `BaseButton`. Raw `VBtn` is reserved for Vuetify-internal slots (e.g. `VBtnToggle` children) and menu activators that need `v-bind="activatorProps"` (BaseButton accepts those too).
- Choose an `intent`, not a colour: `primary` (the one main action in a view/toolbar/dialog — New site, Upload, Add user, Confirm), `secondary` (a second constructive action — New folder, New group), `tertiary` (toolbar utilities, Cancel, view/refresh), `danger` (destructive confirm). `color`/`variant` still override for genuine one-offs.
- Shape and density come from `plugins/vuetify/defaults.ts` (`rounded: 'pill'`, 36 px). Never re-declare them in a wrapper, and never bind `:rounded="undefined"`-style pass-throughs — Vuetify treats a bound `undefined` as "provided" and the app default is lost (`BaseButton` filters these).
- Icon-only buttons never show a fill (global rule), so `BaseButton` draws a filled-intent icon button
  as a coloured icon (`primary` → primary icon, `danger` → red). Do not hand-roll `VBtn icon` with
  `variant="flat"` — its on-colour (white) icon would sit on the page background.
- A state must not be conveyed by colour alone: toggles change shape too (outline vs filled star) and
  expose `aria-pressed`. Icons that carry meaning need 3:1 against their background (the sandbox
  icon-contrast probe checks icon buttons; axe does not).
- Icon-only buttons need an accessible name: `aria-label`, or `tooltip` (used as the fallback). Development logs a warning otherwise.
- The action wrappers (`NewSite`, `NewFolder`, `DropZone`, `NewUser`, `NewUserGroup`, `NewAccessKey`, `ToggleTiles`, `Refresh*`, `DeleteSelected`) carry their intent as a default; pass `intent` to change it in a specific context (e.g. an empty-state CTA).

## Dialogs

- Use `BaseDialog` with `v-model` (`modelValue`) — dialog components expose the same single `v-model`; do not invent `isDialogVisible`/`dialog` names.
- Footer: `confirm-text` (+ `confirm-intent`, `cancel-text`, `confirm-disabled`, `loading`) renders Cancel → Confirm and emits `confirm`/`cancel`. For a form body, give the `VForm` an `id` and pass it as `form` — Confirm becomes the form's submit button so Enter and the button share one `@submit` handler. Use the `actions` slot only for non-standard footers. `VCardActions` in the default slot is not supported.
- `loading` locks the dialog (Cancel/Close disabled, Escape/backdrop ignored, Confirm spinning). Confirm never closes the dialog by itself — close it when the work succeeds.
- Focus: a form dialog focuses its first field (`autofocus`); on close `BaseDialog` returns focus to the
  opener (for a menu item, the menu's button). Do not move focus elsewhere after closing unless you navigate.
- Order: Cancel (tertiary) → Confirm (primary, or `danger` for destructive). Destructive actions always confirm and, where possible, offer Undo in the success toast (`useAlert().addWithAction(alert, { label: 'Undo', onAction })`).
- Bulk operations go through a store action that batches requests, reports progress to the dialog (`VProgressLinear` + `aria-live`), refreshes once and shows one summary toast; items that failed stay selected.
- Never use `window.confirm` / `alert` / `prompt` (`check:ce-ui` hard rule).

## Empty states

- Use `EmptyState` (`icon`, `title`, `text`, `actions` slot, `compact` inside cards). One neutral icon colour; no per-page colours.
- Every empty state that has an obvious next step shows that action with the same wrapper the toolbar uses (`NewSite`, `DropZone`/`NewFolder`, `NewUser`, `NewAccessKey`), gated by the user's role.

## Page structure

- Every routed view renders `PageHeader` (`title`, optional `documentTitle`, `visible`, `actions` slot). It owns the page `<h1>` (visually hidden unless `visible`) and `document.title` (`"<page> · Clear Ideas CE"`); non-routed pages (docs, login) call `usePageTitle()` directly.
- Breadcrumbs are `<nav aria-label="Breadcrumb"><ol>` with `aria-current="page"` on the last item.
- Heading levels follow the page: `PageHeader` is the `h1`, a `SettingsCard` title is an `h2`
  (`VCardTitle tag="h2"`), sections inside a card are `h3`. Never pick a heading level for its size —
  the styles come from classes.

## Side-nav layouts _(Phase 2.7)_

- Settings, site settings and analytics use `SideNavLayout` (`items` = sections `{ key, label, icon }`
  and headings `{ heading }`, `v-model`-style `modelValue`, `label` for the `<nav>`). Do not hand-roll
  two-pane markup.
- The parent owns the selection: `update:modelValue` is a *request*. Route-backed sections navigate
  first and change the selection only when the navigation succeeds, so a cancelled unsaved-changes
  prompt leaves the form mounted (same rule for `BaseTabs`).
- ≤ 959 px the navigation becomes an icon rail; each item keeps its label as its accessible name and
  tooltip. The layout is its own scroll container with a sticky navigation.
- Card typography inside the layout (`h4` section titles, paragraph spacing) comes from
  `styles/settings.scss`; management rows (`.settings-management-item`: icon, text, actions) wrap their
  actions onto a second line on phones.

## Avatars _(Phase 2.8)_

- One `components/base/Avatar.vue`: up to two initials, deterministic colour from `config/avatar.ts`.
  It is decorative (`aria-hidden`) because it always sits next to the person's name; pass `label` when
  it stands alone.

## Tooltips

- `vue-tippy` is the single tooltip system, installed by `plugins/tippy.ts` with app-wide defaults (`ci` theme in `styles/libs/tippy.scss`, 300 ms delay, shows on focus as well as hover, long-press on touch). Use the `v-tippy` directive (or `BaseButton`'s `tooltip` prop) for strings, `<Tippy>` for rich content. `VTooltip` is forbidden (ESLint + `check:ce-ui`).
- Tooltips are supplementary: the control must still have an accessible name.

## Preferences

- UI preferences (view mode, page sizes, theme, nav rail, search-results width) go through `usePreferences()` → `stores/preferences.store.ts`. Read `preferences.<key>` in templates and assign to it directly; never a bare `ref` in a store or `localStorage` access in a component.
- Persistence is two-layer: localStorage for the first paint, profile `attributes.ui` as the source of truth (server wins when the profile loads; changes are written through, debounced and silent). Add a key by extending `UiPreferences`, `DEFAULT_PREFERENCES` and `sanitizePreferences()`.

## Pickers and selects

- A control that opens a list of options is a `VSelect`/`VAutocomplete` (combobox + listbox semantics),
  never a read-only `VTextField` with a `VMenu`. Presets and "All" entries go in the `prepend-item` slot.
- Every select has a visible label or `aria-label`; in tables, name it for its row (`Role for <name>`).

## Loading and errors

- Every `VProgressCircular`/`VProgressLinear` has an accessible name (`aria-label="Loading sessions"`);
  `check:ce-ui` `progress-needs-name` is a hard rule. `BaseButton :loading` supplies its own.
- A list whose request failed shows `LoadError` (message + Retry), never its empty state — "No sites
  yet" must mean there are none. Stores expose the error (`siteStore.sitesError`), and load actions
  catch their own rejections.
- Dividers inside lists and menus are `aria-hidden` (a separator is not a valid list child).

## Roles and permissions

- What a site role may do in the UI comes from `siteContentPermissions(role)` (`config/roles.ts`:
  `canEdit`, `canDownload`, …), which mirrors core's role groups (`test/web/roles.test.ts` keeps them in
  parity). Never compare role names inline (`role !== 'viewer'`).

## Forms

- Settings-style forms use `useDirtyForm(() => snapshot)` and pass `:dirty` to `SettingsCard` and `:disabled="!dirty"` to Save; call `markClean()` after loading values and after a successful save. Inline errors go to the card's `error-message`, not a page-level alert.
- Route views hosting such forms register `useUnsavedChangesGuard(() => anyDirty)`; the confirmation is the app-level `UnsavedChangesDialog` (never `window.confirm`). The guard covers leaving the route *and* route updates (switching settings section or site tab).
- The form's snapshot must be taken from the same normalised value the editor shows: a child that
  normalises its model on mount (e.g. `Schedule` via `utils/schedule.ts normalizeSchedule`) would
  otherwise make a fresh form "dirty". `useDirtyForm` compares key-order-insensitively.
- Never bind a form field to a store's array/object directly — copy it (`[...store.hours]`) so edits do
  not write through before Save.
- Profile `attributes` are merged by top-level key on the server: when writing `sites`/`notifications`, spread the existing object so sibling values survive.

## Lists and tiles

- Every row and tile has a real link to its destination: the name is an `ItemLink` (`to` = the route).
  Rows keep their whole-row mouse click; tiles use `<ItemLink stretched>` so the whole tile is the link
  and the controls inside it (checkbox, favourite, menu) sit above it (`z-index: 2`). Never make a
  `VCard`/`tr`/`div` the only way to open something — it is not focusable.
- A view whose subject failed to load (site, file) shows "not available" (404/403) with a way back, or
  `LoadError` with Retry — never the empty state of its content.

- A list view and its tile view are two renderings of the same data: they must share state (`useContentFilters()` via `provideContentFilters()` in the route view; `useSiteFilters()` for sites), the same page size (`preferences.sitePageSize`) and the same `TableFooter`. Sorting/filtering logic lives in pure functions (`applyContentFilters`, `sortContent`) — never inline in a component.

## Chat

- All chat UI is `components/chat/ChatPanel.vue` (Ask and the site AI tab): `@ai-sdk/vue` `Chat` over
  `DefaultChatTransport` to `/api/chat`. The request body is built by `chatTurnBody()` (`utils/chat.ts`,
  validated with the contracts-core `ChatTurnRequestSchema`) and carries only the new question — the
  server stores the conversation. Do not send the message history from the browser.
- The stream's transient `data-conversation` part gives a new conversation its id (the panel emits
  `update:conversationId`; Ask routes to `/ask/:id` with `router.replace`), `data-status` drives the
  "Searching…/Reading…" line, and `data-sources` (persisted) renders the Sources list.
- Sources are links to the file route (`name: 'file'`), with the site name when a conversation spans
  sites (`show-source-sites`). Never render a source as plain text.
- The message list is a `role="log"` live region that is focusable (keyboard scrolling); each message is
  an `article` named "You"/"Clear Ideas". Enter sends, Shift+Enter adds a line.

## Types

- `@typescript-eslint/no-explicit-any` is an **error** in `src-web` and `packages/clearideas-pdf-viewer` (tests are exempt). Reach for `unknown` plus a narrowing, a `Pick<…>` of a domain type, or a new type in `types/domain.ts` — never `any`.
- Domain shapes live in `types/domain.ts`: `FileItem`/`Folder`/`Site`/`User`, the list row type `ContentItem` (file *or* folder as produced by `contentStore.contents`), `ContentAncestor`, `SiteTab`, and the agent stream (`AgentStreamMessage`). Analytics report rows are `AnalyticsRow` / `AnalyticsDashboardData` (`stores/analytics.store.ts`) — loose by design, every column optional.
- Nav entries are `NavMenuItem` (`layouts/components/utils.ts`); route targets are `RouteLocationRaw`, not `Record<string, unknown>`.
- `catch (error)` is `unknown`: use `errorMessage(error, 'Fallback text.')` from `utils/errors.ts` to show it to the user.
- Props typed as `any[]`/`item: any` are the first thing reviewers look for; a component that needs only a few fields takes `Pick<User, 'id' | 'email'>`-style props.

## Copy

- Site roles (labels, descriptions, glyphs) come from `config/roles.ts` (`SITE_ROLES`, `ASSIGNABLE_SITE_ROLES`); descriptions match the permission matrix in `packages/clearideas-core/src/services/config.ts`.

## Accessibility baseline

- Everything clickable is a `<button>`, `<a>` or a Vuetify component that renders one. No `@click` on `<span>`, `<div>` or `VIcon`. Row/menu activators are `BaseButton` icon buttons named for their row ("More actions for {name}"); toggles expose `aria-pressed`.
- No keyboard traps: a control that captures Tab (code editors) must release it on Shift+Tab and on
  Escape-then-Tab, and say so in its description. Non-interactive content is never a Tab stop (no empty
  `VList`, no scrollable decorative element without `tabindex="-1"`, no `v-tippy` on an `<svg>` — tippy's
  focus listener makes it focusable in Chromium).
- Forced colours (Windows High Contrast) drop backgrounds and shadows: a state shown only by a tint
  (active nav item, selected row) needs a border/outline or a `@media (forced-colors: active)` rule.
- Keyboard focus is always visible (`styles/misc.scss` `:focus-visible` rules); non-essential motion is disabled under `prefers-reduced-motion`. Resizable panels expose `role="separator"` with arrow-key handling.
- A control's visible text is part of its accessible name (WCAG 2.5.3 *Label in Name*, so voice
  control users can say what they see): do not put `aria-label="Create site"` on a button that reads
  "New site"; an avatar trigger reading "AL" is named "Account menu, AL" (axe ignores parenthesised text); a view switcher reading
  "List" is "View: List". The e2e scans include the WCAG 2.1 rule set that checks this.
- Form controls have a visible label or `aria-label`. Checkboxes use `IconCheckbox`: pass `label` (visible) or `aria-label` (row selection); `description` is wired through `aria-describedby`.
- Placeholder and hint text is text for WCAG 1.4.3: use `rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))` (≥ 4.5:1 in both themes), never the disabled opacity (0.38).
- `test/web/theme-contrast.test.ts` computes WCAG ratios from `theme.ts` for the pairs the UI depends on; add a pair there when introducing a new text/background combination.
- e2e axe scans must run on a settled page (wait for the empty state / a rendered control), not on a loading skeleton — a skeleton hides the real text and the scan passes vacuously.
- `:focus-visible` is never removed. Respect `prefers-reduced-motion` for non-essential animation.

## Testing

- `test/web/app-shell-a11y.test.ts` mounts the real app shell at the main routes and runs axe's structural rules in jsdom — run it before the Playwright scans; it catches naming/ARIA issues without a browser (contrast and layout-dependent rules remain in `test/e2e/ui-a11y.spec.ts`).
- Tests must not depend on the machine's time zone: build date fixtures with the local-time `Date` constructor (`new Date(2026, 4, 3, 10)`) and parse typed `yyyy-mm-dd` values with `parseLocalDay`, never `new Date('yyyy-mm-dd')` (UTC midnight). The sandbox runs in UTC; reviewers do not.
- The web suite runs one file at a time in isolated child processes (`pool: 'forks'`, like the API and coverage configs). Files rely on per-file `vi.mock` and `document.body`, so `isolate: false` is not an option; do not add shared module-level state that assumes a fresh worker.
- Component tests mount through `test/web/harness` (`mountWithVuetify`) — real Vuetify, memory router, testing Pinia, vue-tippy — and call `expectNoA11yViolations(wrapper)`.
  Stubbing `V*` components is not allowed for new tests.
- Every primitive has a spec under `test/web/` covering render, interaction (keyboard included) and axe.
- Feature specs (`test/web/feature-*.test.ts`) mount the whole app at a route with `mountApp(path)`
  (`test/web/fixtures/app.ts`) against an in-memory fake CE API (`fixtures/backend.ts`, installed at
  the `fetch` level; it enforces authentication and records requests). Seed data uses real-looking
  ObjectIds from `fixtures/index.ts` (`ID.*`). Use `waitFor`, `byText`, `openSelect` and `toasts()`
  rather than timers; page-level scans use `expectNoBlockingA11yViolations` (the e2e policy).
  The fake API streams chat turns like the server (`backend.chat`: `configured`, `models`,
  `conversations`, and `reply()` to script the answer, status lines and sources).
- Coverage gates (`npm run test:ce:web:coverage`, run in CI): `components/**` and `views/**` at
  70 % lines / 60 % branches (`vitest.web.config.ts`).
- UI journeys live in `test/e2e/ui-*.spec.ts` and run across the `desktop-light`, `desktop-dark` and `mobile-light` projects; use `test/e2e/helpers/ui.ts` (`signInViaForm`, `expectPageAccessible`, `expectToast`).
- Visual baselines: `test/e2e/visual.spec.ts` (tag `@visual`) screenshots the core screens in all three projects. `npm run test:ce:visual:update` captures them into `test/e2e/__screenshots__` (commit the PNGs; capture on the OS the team compares on); `npm run test:ce:visual` compares. `test:ce:e2e` excludes `@visual`, so baselines never block the functional run. A style change is approved by reviewing the diff report, then updating. These baselines are also the source of the README screenshots (Phase 4.3).
