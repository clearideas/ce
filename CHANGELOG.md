# Changelog

## Unreleased

### AI chat (Ask)

- **Ask** (new main navigation item, `/ask`): one question box over every site you can read that has AI chat turned on, or one site chosen when the conversation starts. Answers stream in, show what the assistant is doing ("Searching for …", "Reading …"), and list the files they are based on as links (with the site name when a conversation spans sites).
- Conversations are stored on the server per user (`cechatconversations`): listed under Ask (phones: **History** menu), reopened by URL (`/ask/:id`), renamed and deleted. A site's **AI** tab now uses the same assistant and keeps its conversations too (latest opens by default, earlier ones in a picker; all are listed under Ask). Deleting a site deletes its site conversations. Conversations from the old browser-only site chat are not migrated.
- Chat runs on `@clearideas/agent-runtime` (the Agents engine) instead of a separate AI SDK loop: one prompt step per turn with read-only content tools (`list_sites`, `search_content` across the conversation's sites, `list_content`, `get_content_metadata`, `retrieve_file_content` incl. extracted PDF text), bounded tool calls, and the runtime's provider adapters (OpenAI, Anthropic). `AI_CHAT_MODEL`/`AI_CHAT_MODELS` stay separate from `AI_AGENT_MODEL`.
- Access is checked on every tool call with the same rules as the rest of the app: read access to the site and AI chat on for it; files outside the conversation's sites cannot be read even by id. Agents' Site tools and chat share one implementation (`services/content-tools.ts`).
- API: `POST /api/chat` (AI SDK UI message stream; body `{ conversationId?, siteId?, message: { id, text }, model? }` — only the new question is sent, the server keeps the history), `GET /api/chat/models`, `GET /api/chat/sites`, `GET/PATCH/DELETE /api/chat/conversations[/:id]`. Removed `POST /api/sites/:siteId/chat` (the web app was its only client).
- Rate limits: the chat, agent and analytics limiters now apply only to their own paths. They were mounted without a path, so every later `/api` request (agents, MCP, app config) also counted against the chat limit (120 per 15 min), and MCP against the agent limit.
- Updated `@clearideas/agent-runtime` from 0.4.1 to 0.6.3. Its provider adapter handles Anthropic's `anthropic.message_start` metadata, allowing CE to use the provider versions supported by the runtime. CE uses the runtime's provider adapters for chat and rejects agent manifests that declare runtime `workspaces` or connections.

### Web UI

- The Inter typeface is now bundled (`@fontsource-variable/inter`); previously it was referenced but never loaded, so most installs rendered in the OS fallback font.
- Icons: switched to an explicit FontAwesome Free registry (`src-web/src/icons`). Pro-only names that rendered as empty SVGs (Site AI empty state, file "no viewer" state, analytics dashboard, site Notifications settings, invite status chip) now render; the bundle no longer ships the full solid/regular/brands sets. Persisted site icons keep working through a legacy alias map.
- Checkboxes (`IconCheckbox`) are real, labelled `<input type="checkbox">` controls: keyboard-operable and announced by screen readers, with the same square/check visuals. Array models are replaced rather than mutated.
- Fixed the OS dark/light listener being detached when the theme toggle unmounted (mobile search), a status-icon subscription leak, and settings-card props leaking onto the header icon.
- Decorative icons are hidden from assistive technology by default again (Vuetify default restored).
- The PDF viewer is now the `@clearideas/pdf-viewer` workspace package (consumed from source; typed `labels` prop replaces the stub translator, viewer events are real emits, pdf.js 6 typings applied, document viewport gets `role="region"`).
- Route-level code splitting: only the login and sites views are in the entry chunk (3.06 MB → 0.5 MB); Vuetify components are tree-shaken via `vite-plugin-vuetify` instead of registered globally; highlight.js ships a curated language set (markdown chunk 1.0 MB → 0.17 MB).
- Buttons: `BaseButton` gained `intent` (`primary`/`secondary`/`tertiary`/`danger`) and the toolbars now show a clear hierarchy — New site, Upload, Add user and Create key are filled primary actions; New folder and New group are secondary; view/refresh/delete utilities are tertiary. Shape (pill) and height (36 px) are defined once in the Vuetify defaults.
- Dialogs: `BaseDialog` has one `v-model` and a standard footer (Cancel → Confirm, with `loading` locking the dialog); all dialogs migrated (site, folder, delete, user, group, access key, rename, agent delete, run details). Dialogs are labelled for assistive technology. Cancelling a bulk delete no longer clears the selection.
- Empty states: one `EmptyState` component replaces nine variants; "No sites", "No content", "No users", "No groups", "No access keys" and the analytics gate now offer the relevant action.
- Page structure: every page has an `<h1>` and a descriptive `document.title`; breadcrumbs are a navigation landmark with `aria-current`.
- Row actions (favourite, visibility, users, "More"), pagination and the search-results resize handle are real, named, keyboard-operable controls; keyboard focus is always visible; non-essential animation respects `prefers-reduced-motion`; footer text meets contrast.
- Tooltips: one app-wide vue-tippy configuration and theme; tooltips show on keyboard focus.
- Site role labels/descriptions come from one source and match the server's permission matrix (viewers cannot download; downloaders can). The Site ID in site settings is a copyable field.
- Navigating into a site fetches it once instead of two to three times.
- Data-table column headers use an opaque muted label colour (6.4:1 light / 12:1 dark; the previous opacity blend measured 4.4:1 on the header tint). A theme-contrast unit test now computes the WCAG ratios for primary, medium-emphasis and header text from the theme source.
- Theme: the primary blue is one step darker in light mode (`#3F5EF0`) and one step lighter with dark text in dark mode (`#5290F5`), so primary text and primary buttons meet WCAG AA contrast (4.33:1 → 5.16:1 light; 4.39:1 → 5.23:1 dark). The account-menu trigger and mobile navigation toggle are named buttons; the sidebar is a navigation landmark; settings name fields are labelled.
- View preferences persist: tiles/list, page sizes, theme, navigation rail and search-results width are remembered per browser and synced to the profile (`attributes.ui`), so they follow you across devices.
- Fixed the content "Updated before/after" filter being off by one day for users west of UTC (the typed date was parsed as UTC midnight, then adjusted in local time). Dates are now calendar days in the user's time zone.
- Content views: list and tiles share one sort/filter state (a new **Sort** control in the toolbar, in step with the list's column headers), and the tile view is paginated with the same page size as the list — switching views no longer changes what you can do. Sites tiles are paginated too.
- Destructive actions: "Block site" asks for confirmation and its success toast offers **Undo**; deleting several items runs a few requests at a time with a progress bar, refreshes once, reports anything that could not be deleted and keeps those items selected.
- Settings forms: Save is enabled only when something changed, cards show an "Unsaved changes" marker, errors appear in the card, and navigating away with unsaved changes asks first (app dialog; browser prompt on tab close). Applies to profile, notifications and all site settings cards.
- Fixed saving notification settings wiping favourites, blocked sites and the auto-accept setting (the `sites` attribute was replaced rather than merged).
- Settings page split into focused components (profile, notifications, active sessions, access keys); revoking an access key now asks for confirmation, and the new-key panel has a Copy button. The Agents entry in the sidebar is highlighted when active.
- Search: on desktop the search box is always visible at its full width with its placeholder (now at AA contrast in both themes) and a ⌘K / Ctrl K hint (it still collapses to an icon on phones); it is announced as a search field; results show a loading skeleton and the result count is read out. Metadata highlighting (`@contentType:` …) is unchanged.
- Types: the web UI and the PDF viewer package no longer use `any` (68 → 0; the lint rule is now an error). Content rows, breadcrumb ancestors, navigation entries, the agent event stream, analytics rows/dashboard data and site attributes (`ai`, `mcp`, `pdf`, `notifications`) are typed; the unused nav-group helpers were removed.
- Active sessions (Settings → Security) lists every signed-in browser with device, IP address and last activity; sign out any one of them or all others (with confirmation).
- Accessibility pass in a real browser (axe in Chromium, light/dark/mobile, 21 pages + 7 dialog/menu states): 0 serious/critical findings (previously 19 of 21 pages failed). Light-theme semantic colours are one step darker (primary `#3D5BE9`, secondary `#626C7A`, error `#B23D3D`, success `#127546`, info `#2F68C5`) and every semantic fill uses dark text in dark mode, so text, buttons, chips and alerts all meet 4.5:1; avatar colours likewise. Progress indicators, row checkboxes, role/site/page-size selects, expand toggles, icon pickers and site-row icon buttons (now 24 px targets) are named; list dividers are hidden from assistive technology; site chat is a live log.
- Links inside rendered Markdown (site chat answers, Markdown files, agent output) are underlined, as the Markdown styles intended (a global override removed all link underlines).
- Pickers (Add user: sites and role; PDF print roles; analytics actions) are real selects instead of read-only text fields with a menu.
- Lists that fail to load show an error with **Retry** instead of "No sites yet" / "No users".
- Site content: breadcrumbs show the full folder path (they showed only the site inside folders); ticking a row's checkbox no longer also opens the item; New folder/Upload/drag-and-drop and Download are offered only to roles that may use them.
- Site members: removing a member (from one site or all sites) asks for confirmation.
- Settings: switching sections or site tabs with unsaved changes now asks first (previously only leaving the page did), and site settings cards are covered; cancelling keeps your edits. Saving the profile sends the new account name (it sent the old one); notification hour edits no longer apply before Save; notification settings no longer open as "Unsaved changes", and a saved monthly schedule ("2nd Tuesday") is no longer reset to "1st Monday". The non-functional user-group _Edit_ action was removed.
- Settings, site settings and Analytics share one section navigation (`SideNavLayout`): same width and rail behaviour everywhere, the navigation stays in view while the content scrolls, and it is a labelled navigation landmark. On phones, rows in Settings (sessions, access keys, invitations, blocked sites) put their buttons on their own line instead of clipping them.
- One avatar component across the app (users table, account menu): two initials and the same colour for the same person everywhere.
- Search: zero results say _No results for "…"_. Analytics uses your saved time zone on first load (it could use the browser's). Agents: failed runs appear in history (so they can be resumed), deleting a schedule asks first, and errors are reported. The sites list is fetched once per page load (was three times).
- PDF viewer uses pdf.js's legacy build: the modern build failed to render pages in Chromium 145 and other recent-but-not-latest browsers.
- Settings cards are real sections for assistive technology: card titles are level-2 headings and their sections level-3 (were unrelated `h4`s after the page `h1`); no visual change. On phones the "Unsaved changes" marker sits under the card subtitle instead of squeezing the title.
- Warning chips and alerts ("Unsaved changes", "Expired" access keys, suspended agent runs, "agent runtime not configured") are filled amber with dark text; the tonal style drew amber text at about 2:1 contrast.
- Voice control: buttons are named by what they show (WCAG 2.5.3) — "New site" (was announced as "Create site"), the view switcher "View: List/Tiles", the account button "Account menu, AL", the logo link includes "Community Edition". Landmarks: the sidebar is one container with the "Main" and "Settings" navigations (no unnamed wrapper), and the search-results panel is a labelled complementary region. The users table's expand column has a header name.
- Keyboard: every site, file and folder name in lists and tiles is a link (Tab to it, Enter opens it; Ctrl/⌘-click opens a new tab). Before, rows and tiles opened only on a mouse click (content tiles were not reachable at all). A whole tile is still clickable, and its checkbox, favourite and menu buttons still work on their own. Settings, site settings and Analytics sections are links too. Sidebar icons are no longer separate (empty) Tab stops.
- Phones: the **New site** (+) and **Upload** buttons were invisible — white icons on a white background, because icon buttons drop their fill. Icon-only buttons now draw their icon in the action's colour. The site tabs (Content, AI, Users, Settings) no longer run under the toolbar (tighter tabs; on screens under 380 px Upload moves into the ⋮ menu, now listed first). Card titles and subtitles wrap instead of being cut off with "…".
- Analytics: folders in "Most active content" showed as "Unknown content" (only files were looked up); the dashboard's count cards keep plural titles ("Total files", "Active users") when the count is 1.
- Windows High Contrast (forced colours): the current sidebar/section item is outlined (it looked like any other link).
- Favourites: not-favourite is an outline star and favourite a filled, darker orange star (3.6:1; the old orange was 2.3:1 and the two states differed only by colour).
- Dialogs return keyboard focus to whatever opened them when they close (a row menu's button when opened from a menu); before, focus fell to the top of the page. The Rename field is focused when the dialog opens.
- Search results are links (keyboard, open in new tab); Escape closes the results panel from the results or the search box and puts focus back in the box.
- The agent manifest editor is no longer a keyboard trap: Tab still indents, but Shift+Tab, or Escape then Tab, leaves the editor (screen readers announce this). Empty agent lists and the decorative highlighted copy of the manifest are no longer Tab stops.
- Opening a site or file that was deleted, moved or is no longer shared shows "This site/file is not available" with a way back (a site showed a spinner and "No content yet"; a file a bare error); other load failures offer Retry.
- Agent schedules default to the time zone saved in your profile (they used the browser's). The "Shared with you" icon in site rows is the same size as its neighbours.
- Styles: one colour source (theme), shadow tokens with dark-mode values, `color-scheme` for native controls; dead stylesheets and utilities removed; `!important` declarations 248 → 40.
- Tests: browser specs start the server on the origin the runtime is configured for (`test/e2e/helpers/server.ts`), so Better Auth's origin check applies as in production (revoking a session failed with "Invalid origin" on a random port); a second signed-in person is admitted like an invited member (`ensureInvited`), since CE only lets the first user sign up.
- Tooling: ESLint/Prettier/Stylelint configs, `vue-tsc` type-checking of SFCs, a dependency-free UI convention ratchet (`npm run check:ce-ui`), a Vuetify-mounted component test harness with axe, a Playwright light/dark/mobile matrix, and visual baselines (`npm run test:ce:visual[:update]`) for the core screens. See `apps/clearideas-ce/docs/ui-conventions.md`.

### Configuration

- Windows: the server did not read the repo-root `.env.ce`/`.env.ce.local` when started from the app folder (`npm run dev:ce`), because the env-file lookup tested `process.cwd()` for a forward-slash path. Settings kept there (e.g. `AI_AGENT_MODEL`) were silently missing and Agents reported "not configured". Env files are now located from the server's own location on every OS, and startup logs which env files were read and which agent model is in use.
- A blank variable now counts as unset, so documented fallbacks apply: `AI_AGENT_MODEL` → `AI_CHAT_MODEL`, `AI_CHAT_MODEL` → `CHAT_MODEL`, `AI_CHAT_MODELS` → `AI_CHAT_MODEL`, `BETTER_AUTH_URL` ↔ `APP_URL`. `.env.example` ships these blank and docker-compose passes unset ones as empty strings, so the fallbacks never applied there.
- Agents: the "not configured" warning no longer flashes while the page loads, and names both variables and the restart.

### Search

- Fixed full-text search dropping valid results: multi-word queries now require every word (AND), fuzzy matching only applies to longer words, and results are no longer re-validated against a truncated snippet. Searching never rewrites the index.
- Fixed `@tag`, `@tags`, `@createdAt`, `@uploadedAt`, and custom metadata filters (`@expiryDate:2026`) returning nothing. Content tags are now searchable and metadata keys match case-insensitively.
- Fixed filename search silently examining only the first 200 files of a site/user. Filename and content-type predicates now run in the database with a bounded, deterministic scan.
- Fixed `@constructor:` / `@__proto__:` style queries causing a 500 error.
- Search indexes are now persisted atomically to a single versioned file with coalesced writes (`SEARCH_INDEX_FLUSH_DELAY_MS`). Unreadable indexes are quarantined and rebuilt automatically from MongoDB and local storage; indexes catch up on changes made while unloaded. Added `npm run reindex:ce`.
- Indexed text per file is capped (`SEARCH_INDEX_MAX_TEXT_BYTES`) and full text is no longer duplicated in the index files. Indexing runs in the background after uploads.
- Cross-site search results are merged by relevance instead of site order. Snippets cover each matched term.
- Deleting a site removes its search index and stored files; deleting a file removes its extracted-text companion object. Folder and site renames propagate to the index.
- MCP `search_content` arguments are validated (query length, site IDs, limit).
- Pending search index changes are flushed on `SIGTERM`/`SIGINT`.

### Search analytics

- Every search is now recorded as a `content-searched` activity across all channels (web, MCP, site chat, agents); site chat and agent searches were previously not recorded and MCP searches were recorded in a form no report could read.
- Multi-site searches are attributed only to the sites where they matched, one record per matched site with that site's own result count, so administrators never see search terms that concerned other sites. Searches that matched nowhere are kept as user-level audit records without site attribution.
- Added an admin-only **Search terms** report (`POST /analytics/search-terms`, `POST /site/:siteId/analytics/search-terms`, and an Analytics tab) showing term, search count, distinct users, zero-result count, last searched, and channel breakdown.
- `content-searched` is included in default activity counts; the analytics action filter now uses the real action names (`file-downloaded`, `file-uploaded`, `folder-created`, `content-deleted`) — previously selecting those filters matched nothing.
- Fixed site-scoped analytics routes (`/site/:siteId/analytics/...`) reporting on every site the caller administers instead of the requested site only (the validated `siteId` param was not recognised as a site filter).
- Removed unmounted activity-listing controller methods that would have exposed raw activity attributes.
- The `mcp-search-content` action name is replaced by `content-searched` with `source: 'ce-mcp'`.

### Extraction

- PDF text extraction is bounded by size (`PDF_EXTRACTION_MAX_BYTES`), pages (`PDF_EXTRACTION_MAX_PAGES`), time (`PDF_EXTRACTION_TIMEOUT_MS`), and concurrency (`PDF_EXTRACTION_CONCURRENCY`). Extracted text is stored only as a companion object, not in MongoDB. PDFs whose extraction fails remain searchable by name; failed extractions are retried on demand after a cool-down.

### Tooling

- Fixed Vitest configs resolving to an invalid `C:/C:/...` root on Windows ("No test files found").

### Access control

- Site memberships that have expired (`expiresAt`) or been declined no longer grant access to site content or search.

## v0.2.0 — 2026-08-13

- Added lightweight agents powered by `@clearideas/agent-runtime` 0.4.1.
- Added manual agent runs with streamed results, durable history, output inspection, and resumable run records.
- Added portable JSON manifests with syntax highlighting, variables, conditions, and a deliberately limited prompt-step surface.
- Added tenant-scoped, read-only Site tools for search, retrieval, and content metadata.
- Added once, daily, weekly, and monthly schedules using the embedded leased-task worker.
- Added separate `AI_AGENT_MODEL` configuration with fallback to the AI chat model.
- Added agent API, manifest-policy, scheduling, UI, and browser end-to-end coverage.
- Updated production dependencies and release checks, including a guard against private repository references in public exports.

## v0.1.1 — 2026-08-12

- Improved standalone deployment compatibility, authentication, AI chat, MCP, and dependency security.

## v0.1.0 — 2026-05-22

- Initial Clear Ideas Community Edition release.
