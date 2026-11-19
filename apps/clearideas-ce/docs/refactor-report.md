# Clear Ideas CE — Refactor Report and Lessons for the Enterprise Refactor

**Audience:** engineering leads planning the refactor of the Clear Ideas enterprise application, and
CE maintainers. **Scope:** the Community Edition (CE) monorepo — web UI (`apps/clearideas-ce/src-web`),
server (`apps/clearideas-ce/src`), shared packages (`packages/*`), tests and tooling.

**Companion documents** (all in `apps/clearideas-ce/docs/` unless noted):

| Document | What it is |
|----------|-----------|
| `ui-review.md` | The original review: 60+ findings with IDs (F1, I1, A1 …), each with file/line evidence. Kept as written. |
| `ui-remediation-plan.md` | The decisions, principles, phases and status log, including the Ask (chat) work. |
| `ui-conventions.md` | The rules the refactor established ("one way to do each thing"), enforced where practical. |
| `../TESTING.md` | Test suites, harnesses and how to run them. |
| `/CHANGELOG.md` (repo root) | Every user-visible change and defect fix, by area. |

This report does not repeat those documents item by item. It explains **what kind of problems a
product carved out of a larger one accumulates**, how they were found, what was done about them, what
it achieved, and — the reason for writing it — **how to apply the same approach to the enterprise
application**. The enterprise code was not available to me; everything said about it is an inference
from CE's origin and is marked as something to verify.

---

## Contents

1. [Executive summary](#1-executive-summary)
2. [Starting point](#2-starting-point)
3. [What a port leaves behind — a taxonomy](#3-what-a-port-leaves-behind--a-taxonomy)
4. [How the work was done](#4-how-the-work-was-done)
5. [What changed, by area](#5-what-changed-by-area)
6. [Results in numbers](#6-results-in-numbers)
7. [Verification: how we know it works](#7-verification-how-we-know-it-works)
8. [Open items and known limitations](#8-open-items-and-known-limitations)
9. [Lessons learned](#9-lessons-learned)
10. [Applying this to the enterprise application](#10-applying-this-to-the-enterprise-application)
11. [Appendix A — Finding index and status](#appendix-a--finding-index-and-status)
12. [Appendix B — Tooling inventory](#appendix-b--tooling-inventory)
13. [Appendix C — Commit history of the final branch](#appendix-c--commit-history-of-the-final-branch)

---

## 1. Executive summary

**Where CE started.** The UI looked right: a good light/dark visual language was already there. Underneath
were the marks of a product carved out of a bigger one:

- Enterprise-only assets were referenced but not shipped. FontAwesome **Pro** icon names ran on the
  **Free** set, so several icons rendered as empty boxes. The Inter font was declared everywhere and
  loaded nowhere.
- Code for features that did not make it into CE was still there: bookmarks, "hero" panels, "latest"
  lists, a stubbed translation function and a hard-coded "active sessions" placeholder.
- The same thing was often implemented two or three times with different behaviour: two colour-token
  systems, two avatars, three settings side-menus, filter logic copied four times, and two separate AI
  tool implementations.
- The cascade was held together by 248 `!important` declarations.
- Nothing enforced quality. There was no lint, formatting or SFC type-checking. The web tests stubbed
  out every Vuetify component, and the single end-to-end test drove the API rather than the UI.

**What was done.** The work was a *stabilise → standardise → test* pass, not a redesign. The visual
language was kept.

1. Guard rails came first: lint, format, SFC type-checks, a convention ratchet, a test harness that
   mounts real Vuetify, and a Playwright light/dark/mobile matrix with axe.
2. User-facing defects (P0) were fixed next.
3. A small set of documented primitives replaced the duplicates.
4. Usability fixes followed.
5. Styles were consolidated under visual baselines.
6. Finally, broad test coverage: feature specs that mount the whole app against an in-memory fake API,
   real-server browser journeys, accessibility scans and visual baselines.

Along the way the team asked for a new capability: **Ask**, a chat across sites on the agent runtime
with stored conversations. It replaced a separate chat implementation, so CE ended up with one AI
engine and one set of access-checked content tools.

**Results.** Details are in §6.

| Measure | Before | After |
|---------|--------|-------|
| Web tests | 11 files; only 5 mounted a component, all with Vuetify stubbed out | 356 tests in 56 files against real Vuetify; 81–83 % line coverage, enforced in CI |
| Browser tests | 1 API-driven smoke spec | 64 end-to-end tests in 3 browser projects, plus 42 visual baselines |
| Accessibility (axe) | 19 of 21 pages failed | 0 serious or critical findings on 41 states × 3 projects |
| Entry bundle | 4.6 MB | ≈0.35 MB |
| `!important` | 248 | 40 |
| Explicit `any` | 84 | 0 |
| Unused global CSS selectors | 57 | 0 |

**The lesson for enterprise.** About two thirds of CE's findings are *inherited*: duplicated
components, cascade debt, inaccessible controls, copy-pasted logic, missing guard rails, and client and
server disagreeing about names and shapes. These very probably exist in the enterprise app as well. The
remaining third are *port-induced* — missing licensed assets, residue of removed features, stubs. Those
are CE-specific, but they show where CE and enterprise diverged and how to keep them from diverging
again. §10 turns this into a phased plan, a measurement script list and a set of decisions for the
enterprise owners.

---

## 2. Starting point

### 2.1 Shape of the codebase

| Part | Contents at review time |
|------|------------------------|
| `apps/clearideas-ce/src-web` | Vue 3 + Vuetify 4 SPA: 123 SFCs (~16.2k lines), 27 SCSS partials (~3.1k lines), Pinia stores, a 2.8k-line PDF viewer, a 941-line `contenteditable` search editor. |
| `apps/clearideas-ce/src` | Express 5 server: Better Auth email-code login, sites/folders/files, MiniSearch full-text index, PDF text extraction, activity/analytics, notifications worker, MCP endpoint, site AI chat (AI SDK), agents (`@clearideas/agent-runtime`). |
| `packages/clearideas-core` | Domain services and Mongoose models shared with the server (permissions, users, sites, search helpers). |
| `packages/clearideas-contracts-core` | Zod request/response contracts shared by client and server. |
| Tests | Unit and API suites (in-memory Mongo) in reasonable shape; web suite with stubbed components; 1 e2e smoke. |

The boundary scripts name the enterprise counterparts: `private-api` (server), `clearideas-web` (web
app) and `@clearideas/contracts-enterprise`. `scripts/check-ce-hygiene.mjs` forbids enterprise terms in CE
source (`enterprise`, `archived`, `billing`/`stripe`, `oidc` …) and `scripts/check-import-boundaries.mjs`
keeps CE and core from importing enterprise code. Those checks kept enterprise *words* out, but not
enterprise *shapes*: the code paths, props, CSS and assets those features needed.

### 2.2 How the work was organised

The review (`ui-review.md`) came first. It was a full static read, because the first sandbox had no
`node_modules` and no browser. The remediation plan (`ui-remediation-plan.md`) then recorded decisions
with the product owner, principles, and phased work items, each with named files and acceptance tests.

| Stage | Contents |
|-------|----------|
| Phase 0 — guard rails | Toolchain and test harnesses. |
| Phase 1 — P0 defects | Font, icons, checkboxes, theme-listener leak. |
| Batch A — primitives and accessibility | Buttons, dialogs, empty states, page structure, row and menu controls, tooltips, PDF viewer package, lazy routes, copy, double loads. |
| Batch B — behaviour | Preferences, shared filters, destructive actions, forms, search, settings split, typing. |
| Batch C — visual consolidation | Tokens, cascade, side-nav layout, avatar. |
| Phase 4 — tests and release | Primitive and feature suites, coverage gates, UI journeys, scans, README screenshots. |
| Follow-on fixes | Found by real-browser and real-server runs. |
| Ask | Chat on the agent runtime, then agent-runtime 0.6.0. |

Phases 0, 1 and Batches A–B were merged before the final branch (`ui/batch-c-and-a11y`) was cut. The final
branch holds Batch C, Phase 4, the accessibility passes, configuration fixes, Ask and the runtime upgrade:
30 commits, 247 files, +11.7k / −4.1k lines (Appendix C).

---

## 3. What a port leaves behind — a taxonomy

Each class below has a description, concrete CE examples (review IDs in brackets), how it was detected,
what fixed it, and the likely relevance to the enterprise app. The classes are the useful output: they
tell you what to look for, and most come with a mechanical detector.

### 3.1 Assets and licences that did not come along (port-induced)

*Symptom:* the code references something the enterprise build provides and CE does not. Nothing
errors, and the UI silently degrades.

- **FontAwesome Pro on the Free set** [I1, I2, I3].
  - Pro style prefixes were mapped to Free at runtime by a compat shim: 255× `fasl`, 19× `fass`,
    9× `fasds`.
  - Pro-only glyphs (`sparkles`, `files`, `bell-exclamation`, `circle-envelope`) rendered as **empty
    SVGs** in the Site AI empty state, the file viewer, the dashboard, notification settings and
    invitation chips.
  - The whole solid/regular/brands libraries (~2,000 icons) were registered to serve ~150.
- **Inter declared in 6 places, loaded nowhere** [F1]. The README screenshots were taken on a machine
  with Inter installed, so they did not show what most users saw.
- **Stubbed i18n.** The PDF viewer carried a 30-key `t()` stub returning English strings [C8].

*Detected by:* static read and a browser console warning ("Could not find one or more icon(s)").
It is now guarded by `test/web/icons.test.ts`, which fails if any `fa-*` name used anywhere is not
registered.

*Fixed by:*
- An explicit icon registry (`src-web/src/icons/registry.ts`, ~152 glyphs) plus a typed concept map
  (`ICONS.settings`, `ICONS.refresh` …), so one concept always gets one glyph.
- A legacy alias map for icons already persisted in site settings.
- Self-hosted Inter (`@fontsource-variable/inter`), checked in e2e with `document.fonts.check`.
- A typed `labels` prop on the packaged PDF viewer instead of `t()`.

*Enterprise relevance:* the enterprise app presumably has the Pro licence, so icons render there. But
the *pattern* — a concept map plus an explicit registry — is still worth adopting, because the same
concept used three different glyphs [I5]. Check how enterprise loads Inter; if it relies on a `<link>`
or a global CSS file, that is the piece the port dropped.

### 3.2 Residue of features that were removed (port-induced)

*Symptom:* code paths, props, CSS and stores for features that do not exist in CE. They compile, some
render, and all add reading and testing cost.

- **Unreachable UI:** `bookmarks` tab branches; `dismissHero()` no-op and `interactionsArmed`;
  `display="latest"`, `latestContents` and `bookmarksWithIcons`; `formatItemWithPreset()` always
  returning `''` yet rendered; unused nav-group helpers; sortable (drag-reorder) remnants [C8].
- **Props and computeds** that were never read, or were constant `true`: `containerWidth`,
  `narrowBreakpoint`, `prependIcon`, `canChangeVisibility`, `canEditSettings`.
- **A placeholder section presented as real:** "Active sessions" was one hard-coded card ("Session
  storage: MongoDB adapter") with a Refresh button that could not change it [U9]. It now lists real
  Better Auth sessions with revoke actions, verified by an API test first.
- **Dead CSS:** 57 unused global selectors, including a 35-selector gradient/SVG-fill system and whole
  utility families [F4].

*Detected by:* `npm run report:ce-css-usage` and `report:ce-vue-usage` (repo scripts), `vue-tsc` with
`noUnusedLocals` (now part of `type-check:ce:web`), and `check:ce-hygiene` (unused TS, orphan SCSS,
unreachable source files). Props that are declared but never read are caught by
`vue/no-unused-properties` (currently a warning).

*Fixed by:* deletion. Each removal was justified by the usage reports and tests.

*Enterprise relevance:* these features are live in enterprise, so this class does not apply there as
dead code. It is, however, the list of places where **CE's version of a shared component diverges from
enterprise's**. That matters if the two are to share UI packages (§10.4).

### 3.3 Duplication with divergence (inherited)

*Symptom:* the same concept is implemented more than once, and the copies have drifted. Every fix has
to be made in 2–4 places, and usually is not.

- **Two colour-token systems:** Vuetify theme versus a hand-kept `--ci-*` set. They had drifted
  (`#f96a51` vs `#ed613f`), referenced undefined variables, and one resolved an opacity variable that
  did not exist, so breadcrumbs rendered at a fallback [F2].
- **Duplicated components:**
  - Two `Avatar` components (one initial vs two, different colours) [C1].
  - Three settings side-menus, one of them inline in Analytics [C1].
  - Nine empty-state implementations with different icons and colours, mostly without a call to
    action [U5].
  - Four `v-model` names for dialogs (`modelValue`, `isDialogVisible`, `dialog`,
    `is-dialog-visible`); a dialog `actions` slot that all 9 consumers ignored; one raw `VDialog` and
    one `window.confirm` [C5, A8].
  - `BaseButton` duplicated its whole template for the tooltip/no-tooltip cases, leaked props to the
    DOM, and sat next to 48 raw `VBtn`s with no rule for which to use [C4].
- **Copy-pasted logic:**
  - ~60 lines of filter/sort logic duplicated between list and tile views, for both sites and
    content [C2].
  - 11 filter refs passed as 33 `v-model` bindings [C3].
  - Tile views lacked pagination and sort, so switching view changed what you could do [U3].
- **Copy:** role descriptions disagreed between two dialogs about whether viewers can download [U7].
- **Server side:** two AI tool sets (site chat's and the agents' "Site tools") implemented the same
  five operations separately, and two AI loops (an AI SDK loop for chat, the agent runtime for agents)
  each had its own model configuration.

*Detected by:* static reading; `report-ce-vue-usage`; the feature specs (list and tile "parity" tests
found behavioural differences).

*Fixed by:* one primitive per concept, documented in `ui-conventions.md`:

- **Buttons and dialogs:** `BaseButton` with `intent` (primary / secondary / tertiary / danger), and
  `BaseDialog` with one `v-model` and a standard footer.
- **Page furniture:** `EmptyState`, `PageHeader`, `SideNavLayout`, `Avatar`, `ItemLink`.
- **Shared state:** `useContentFilters` / `useSiteFilters` via provide/inject, `usePreferences`,
  `useUnsavedChanges`.
- **Single sources:** roles in `config/roles.ts`; one token source (the theme), pinned by
  `token-parity.test.ts`.
- **Server:** `services/content-tools.ts` is the one access-checked implementation behind agent tools
  and chat tools, and chat now runs on the agent runtime.

*Enterprise relevance:* **high.** This class comes from the enterprise codebase. Expect the same
duplicates there, possibly more of them.

### 3.4 Cascade debt (inherited)

*Symptom:* styling works by overpowering the framework rather than configuring it.

- **`!important`:** 248 declarations, 65 of them in `overrides.scss`, which restyled Vuetify
  internals (`.v-btn`, `.v-field`, `.v-data-table`, `.v-tab` …) [F3].
- **`:deep()` into Vuetify:** scoped styles reached into Vuetify internals, e.g. 9 rules in
  `TableFooter` to fake a plain select [H2].
- **Layout hacks:** a "settings shadow-zone" negative-margin hack repeated in 5 views [F6].
- **Hard-coded values:** light-mode shadow colours hard-coded 9 times and reused in dark mode [F7];
  43 inline `style=""` attributes [H3].
- **A global override that hid keyboard focus:** `.v-tab .v-btn__overlay { opacity: 0 !important }`
  removed the tab focus indicator [A6].

*Fixed by:*
- Configuring Vuetify first: defaults, SASS variables and theme.
- Moving element defaults into a `ci-base` CSS cascade layer, so they lose to Vuetify components
  without `!important`.
- Shadow tokens with dark-mode values and `color-scheme` for native controls.
- A `.page-bleed` utility instead of per-view negative margins.
- Stylelint erroring on `!important` in SFCs.
- A ratchet (`check:ce-ui`) that fails CI if the counts go up (`!important` 40, explicit `any` 0,
  inline styles 9, plus hard rules for icon names, long lines and unnamed progress indicators).

*Verified by:* pixel diffs of 34 screen states × 3 projects before and after each style change (sandbox),
then the committed visual spec (`test/e2e/visual.spec.ts`, 14 screens × 3 projects).

*Enterprise relevance:* **high**, and the most likely place for regressions. Do it only under visual
baselines.

### 3.5 Inaccessible controls and missing structure (inherited)

*Symptom:* the app works with a mouse and looks right, but keyboard and screen-reader users cannot
operate it. Static review found the obvious cases; **a real browser found more and worse**.

- **Found statically:**
  - `IconCheckbox` — the *only* checkbox in the app — was an icon with `@click`: no input, no role,
    no focus [A1].
  - Row menus and favourite/visibility toggles were `<span>`/`VIcon` with click handlers [A2].
  - There were no headings or landmarks, and `document.title` was static [A3].
  - Pagination and close buttons had no accessible names [A4].
- **Found only in the browser** (axe in Chromium, light/dark/mobile):
  - 19 of 21 pages failed.
  - Primary text and buttons were below AA contrast in both themes; warning chips were 2:1;
    favourite stars were 2.3:1.
  - Row and tile names were not reachable by Tab (content tiles not at all).
  - Visible labels and accessible names disagreed (WCAG 2.5.3).
  - **On phones the New site and Upload buttons were invisible**: white icons on white, because icon
    buttons drop their fill.
  - The agent manifest editor was a keyboard trap.
  - Dialogs dropped focus to the top of the page on close.
  - Forced-colours mode hid the current navigation item.

*Fixed by:*
- Real controls: a labelled `<input type="checkbox">`; `BaseButton` icon buttons named for their row
  ("More actions for Roadmap.pdf"); `ItemLink` making every row and tile name a real link.
- Structure and focus: `PageHeader` giving every page an `<h1>` and a title; dialog focus return;
  `:focus-visible` rules; reduced-motion handling.
- Contrast: darker light-theme semantic colours, and dark text on fills in the dark theme, pinned by
  `theme-contrast.test.ts`.
- Tests: the e2e axe helper gained the missing WCAG 2.1 rule set.

*Enterprise relevance:* **high.** The same components were inherited, and the contrast values come from
the shared visual language. Budget for a real-browser pass. Static review alone would have shipped CE
with 19 failing pages.

### 3.6 Client–server contract drift (inherited, partly port-induced)

*Symptom:* each side is internally consistent, but they disagree about names, shapes or merge semantics.
These bugs survive unit tests on either side.

- **Analytics:**
  - The analytics action filter offered action names the server never recorded, so selecting
    "downloaded", "uploaded" or "folder created" matched nothing.
  - MCP searches were recorded under an action name no report read.
  - "Most active content" showed folders as "Unknown content", because only files were looked up.
- **Settings and profile:**
  - Saving notification settings **replaced** the `sites` attribute, wiping favourites, blocked sites
    and auto-accept.
  - The profile form saved the *old* account name.
  - A saved monthly schedule ("2nd Tuesday") reopened as "1st Monday".
- **Permission checks:**
  - Site-scoped analytics routes reported on every site the caller administered, ignoring the
    `siteId` route parameter.
  - Expired or declined site memberships still granted access (fixed in `@clearideas/core`).
- **Time zones:** date filters were off by one day west of UTC, and analytics and agent schedules used
  the browser's time zone instead of the profile's.

*Detected by:* feature specs that mount the whole app against a **fake API that enforces the shared Zod
contracts** (`test/web/fixtures/backend.ts`) and record every request, so a test can assert the exact
payload. API tests on the server covered the other side. Several of these bugs predate the UI work and
are recorded in the CHANGELOG under Search, Search analytics and Access control.

*Enterprise relevance:* **high**, especially where `@clearideas/core` or the contracts are shared. Any
fix made in core (membership expiry, search) must be checked against the enterprise server's own
implementation.

### 3.7 Environment and infrastructure assumptions (mixed)

*Symptom:* correct on the original developers' machines and deployment, wrong elsewhere.

- **Windows env loading:** the env-file lookup tested `process.cwd()` for a forward-slash path, so on
  Windows the repo-root `.env.ce` was silently ignored and AI showed "not configured".
- **Blank variables:** a blank value blocked documented fallbacks (`AI_AGENT_MODEL` → `AI_CHAT_MODEL`),
  because `.env.example` and docker-compose pass unset values as empty strings.
- **Rate limiters without a path:** limiters mounted with `router.use(rateLimit)` on routers that share
  the `/api` mount counted *every later request* against that feature's limit. MCP and app-config calls
  counted against the 120-request chat limit, MCP against the agent limit, and so on.
- **Test harness origin:** the e2e server listened on a different origin from the one the auth
  library was configured for, so a state-changing action ("revoke session") failed with
  *Invalid origin* in tests only.
- **First sign-up only:** CE admits only the first sign-up, so any test that needed a second person
  failed until that person was invited.
- **pdf.js modern build:** it failed to render in Chromium 145; CE now uses the legacy build.

*Enterprise relevance:* **check each one.** The limiter and env patterns are easy to grep for (§10.2).

### 3.8 Dependencies and bundle (mixed)

- **Eager routes:** every route was imported eagerly, so the login page downloaded the PDF viewer,
  highlight.js (all languages), markdown-it, the agents UI and the AI SDK. Entry chunk: **4.6 MB**.
  Lazy routes, a curated highlight.js language set and the icon registry brought it to ≈0.35 MB,
  guarded by `bundle-budget.test.ts` (600 kB).
- **Unused direct dependencies:** after chat moved to the runtime, `@ai-sdk/anthropic`,
  `@ai-sdk/openai` and `@ai-sdk/mcp` were removed from the app.
- **An upstream incompatibility found by testing the real provider path:** `@ai-sdk/anthropic`
  ≥ 4.0.72 emits a `custom` content part that `@clearideas/agent-runtime-model-ai-sdk` (0.4.1–0.6.0)
  rejects, which breaks every Anthropic run.
  - CE pins the provider to 4.0.71.
  - A patch for the agent-runtime repository is in `deliverables/agent-runtime/`.
  - The CE unit test that drives the real Anthropic provider with a stubbed `fetch` is the regression
    guard.

### 3.9 Documentation drift (port-induced)

- README screenshot files were shuffled: `ce-login.png` showed Sites, and so on [U13].
- Docs described chat as "not persisted" after it became persisted.
- A footer link opened raw health JSON.

The fix was to generate the README screenshots from a seeded real server (`npm run docs:ce:screenshots`),
so the names match the screens and they are reproducible.

### 3.10 Missing guard rails (inherited)

This is the class that let all the others accumulate:

- No ESLint, Prettier, Stylelint or SFC type-checking [H1].
- Some SFCs were minified onto single lines, and 23 files had lines over 180 characters.
- The web tests stubbed out Vuetify [T1], so layout, theming, defaults, icons and slots were never
  exercised.
- The single e2e test created data via API calls and asserted that text appeared [T3].
- There was no coverage threshold [T5].

*Enterprise relevance:* **decisive.** Do this first (§10.3, Phase E0).

---

## 4. How the work was done

### 4.1 Decisions before code

The plan opened with a short table of product decisions that shaped scope:

| Topic | Decision |
|-------|----------|
| Icons | Free set only, with a typed map and a registry. |
| Search editor | Keep the metadata-highlighting editor and improve its discoverability and semantics; do not replace it. |
| PDF viewer | Vendor it as a package (`@clearideas/pdf-viewer`) and change only its public API. |
| Preferences | Per-browser *and* per-user. |
| Tooltips | `vue-tippy` only. |
| Active sessions | Show real data, or remove the section. |
| Ask | Same access rules, server-side conversations, Site AI on the same engine, `AI_CHAT_MODEL` separate from `AI_AGENT_MODEL`, existing keyword search, a new sidebar item. |

Writing these down early avoided rework. The search editor and the PDF viewer would otherwise have
been rewrite candidates.

### 4.2 Principles

1. **Preserve the visual language.** No palette, radius or spacing changes beyond fixing drift.
2. **Targeted, not a rewrite.** Every work item names its files.
3. **Safety net first.** Lint and a real component harness land before consolidation.
4. **One way to do each thing.** Every primitive has a convention entry, enforced where practical.
5. **Every item ships with its tests.**

### 4.3 Sequencing by verifiability

The plan was re-sequenced after Phase 1, by *what could be verified* rather than by theme. The first
sandbox had a Node toolchain but no browser, MongoDB or network:

- **Batches A and B** needed only component tests, lint and build, so they went first.
- **Batch C** (visual consolidation) waited until screenshots could be compared.

When packages arrived (Node 24, MongoDB binary, agent-runtime tarballs, Playwright/Chromium), each
layer of verification was added and run against everything already done. Each new layer found defects
the previous one could not:

1. Component tests with real Vuetify.
2. Whole-app feature tests against the fake API.
3. The built app in Chromium against the fake API (axe, keyboard and layout probes).
4. The real server and real MongoDB in three browser projects.
5. Visual baselines.

### 4.4 Ratchets instead of big-bang cleanups

`scripts/check-ce-ui-conventions.mjs` records counts in `scripts/ce-ui-conventions.baseline.json` and
fails if any count rises. When a count falls, the baseline is updated deliberately. This let
cleanup happen alongside feature work without a freeze, and it stops regression.

| Count | At review | Now |
|-------|-----------|-----|
| `!important` | 248 | 40 |
| explicit `any` | 84 | 0 (now a lint error) |
| inline `style=""` | 43 | 9 |

Hard rules (must stay 0): Pro icon prefixes, Pro-only icon names, classes inside icon names, lines over
the limit, and progress indicators without a name.

---

## 5. What changed, by area

A summary only; the CHANGELOG has the full list.

### 5.1 Web UI

**Foundation**
- Self-hosted Inter.
- FontAwesome Free registry and `ICONS` concept map.
- One token source (the theme).
- Shadow tokens with dark values; `color-scheme`.
- A CSS layer for element defaults.
- Dead stylesheets removed: `font-size`, `gradients`, `katex`, `dashboard` and the unused utilities.
- `@clearideas/pdf-viewer` package; pdf.js legacy build.

**Primitives** (documented in `ui-conventions.md`)
- `BaseButton` (`intent`), `BaseDialog` (one `v-model`, standard footer, focus return).
- `EmptyState`, `PageHeader`, `SideNavLayout`, `Avatar`, `ItemLink`, `IconCheckbox`.
- `LoadError`, `SettingsCard` (dirty/saving), `TableFooter`.
- `ChatPanel` (Ask and Site AI).

**Composables and stores**
- `usePreferences` (localStorage plus profile `attributes.ui`).
- `useContentFilters` / `useSiteFilters`, `useUnsavedChanges`, `useAppTheme` (single app-level listener).
- Request de-duplication in `siteStore`.

**Behaviour and usability**
- Button hierarchy; persisted view preferences; list/tile parity with shared sort and pagination.
- Confirmations and undo for destructive actions; batched bulk delete with progress.
- Dirty-form guards in every settings card.
- Search always visible on desktop, with a ⌘K / Ctrl K hint.
- Real active sessions; "not available" states for missing sites and files; Retry on load errors.
- `SettingsView` split into focused components.

**Accessibility**
- Real checkboxes, buttons and links throughout; keyboard access to rows and tiles.
- Headings and landmarks; per-route titles.
- AA contrast in both themes.
- Focus rings, focus return, no keyboard traps.
- Forced-colours and reduced-motion support; 320 px reflow.
- Visible text is part of every accessible name.

**Ask** (new)
- Main-navigation page with history, scope selection, rename and delete.
- Streamed answers with activity status and linked sources.
- The Site AI tab uses the same panel and engine.

### 5.2 Server

**Chat on the agent runtime**
- `ChatService`: one prompt step per turn, bounded tool calls.
- `ChatToolAdapter` over `ContentToolOperations`, shared with the agents' Site tools.
- Stored `CeChatConversation` documents.
- An AI SDK UI-message stream with transient status and conversation parts and persisted sources.
- `POST /api/sites/:siteId/chat` removed; its only client was the web app.

**Access and limits**
- The same read-plus-chat-enabled rules are checked on every tool call.
- Deleting a site deletes its site conversations.
- Rate limiters scoped to their own paths.
- `@clearideas/agent-runtime` 0.6.0; manifests declaring runtime `workspaces` are rejected.

**Configuration**
- Env files are located relative to the module, so Windows works.
- Blank env vars count as unset.
- Startup logs which env files were read and which models are configured.

**Earlier hardening**, before the UI work (CHANGELOG *Search*, *Search analytics*, *Extraction*,
*Access control*):
- Full-text search correctness, atomic index persistence, and a reindex command.
- Search-term analytics with per-site attribution.
- Bounded PDF extraction.
- Expired and declined memberships no longer grant access.

### 5.3 Tests and tooling

See §7 and Appendix B.

---

## 6. Results in numbers

"Review" values come from `ui-review.md` (the pre-refactor code); "now" values were measured on the
final branch.

| Area | Measure | Review | Now |
|------|---------|--------|-----|
| Correctness | Icons rendering as empty SVGs | 5 places | 0 (test-guarded) |
| | Brand font actually loaded | No | Yes (e2e check) |
| Accessibility | Pages failing axe (serious or critical) | 19 of 21 | 0 of 41 states × 3 projects |
| | Checkboxes operable by keyboard | 0 | All |
| Bundle | Entry chunk | 4.6 MB | ≈0.35 MB (budget 600 kB) |
| | FontAwesome glyphs shipped | ~2,000 | ~152 |
| CSS | `!important` | 248 | 40 |
| | Unused global selectors | 57 | 0 |
| | SCSS partials | 27 (~3.1k lines) | 22 (~2.4k lines) |
| | Inline `style=""` | 43 | 9 |
| TypeScript | Explicit `any` (web) | 84 | 0 (lint error) |
| | SFC scripts type-checked | No | Yes (`vue-tsc`, `noUnusedLocals`) |
| Duplication | Avatar / settings side-menu / empty-state variants | 2 / 3 / 9 | 1 / 1 / 1 |
| | Dialog `v-model` conventions | 4 | 1 |
| | AI tool implementations / AI engines | 2 / 2 | 1 / 1 |
| Web tests | Files; component mounting | 11 (~840 lines); 5 mount, all Vuetify stubbed | 56 (~7.4k lines); real Vuetify, whole-app feature specs |
| | Tests; coverage | — ; ~0 % of templates | 356; lines 81 % overall, components 82 % / views 93 % (branches 68 % / 81 %; gate 70 % lines, 60 % branches) |
| Server tests | Unit / API | — | 103 / 24 |
| Browser tests | e2e | 1 API-driven smoke | 64 across desktop-light, desktop-dark and mobile-light (+4 project-specific skips) |
| | Visual baselines / README screenshots | none / hand-made, mislabelled | 42 / generated from a seeded server |

Largest remaining files: `BasePDFViewer.vue` is 2.7k lines (vendored by decision), `HandlebarsTextarea.vue`
940 (kept by decision) and `AgentsView.vue` 829 (it grew and should be split; §8).

---

## 7. Verification: how we know it works

### 7.1 The test pyramid as built

| Layer | What it runs | Catches |
|-------|--------------|---------|
| Unit (`test:ce:unit`, 103) | Core and domain helpers, the search index, manifest policy, AI tool schemas. The provider path runs through the real OpenAI and Anthropic SDKs with a stubbed `fetch`. | Logic errors, schema incompatibility, provider and runtime mismatches. |
| API (`test:ce:api`, 24) | The Express app in-process with in-memory Mongo, temp storage and index, captured email. Chat uses a scripted `FakeChatModel` on the real runtime. | Authorisation, access rules, contracts, streaming, rate-limit scoping. |
| Web components (`test:ce:web`) | Every primitive mounted with real Vuetify, router and Pinia, checked with axe. | Rendering, keyboard behaviour, ARIA. |
| Web features (`feature-*.test.ts`) | The whole app at a route against `fixtures/backend.ts`, an in-memory fake of the CE API that enforces auth and the contracts and records requests. | User journeys, payloads sent, error and empty states. Most of the contract-drift bugs in §3.6 were found here. |
| Coverage gate | `test:ce:web:coverage`: components and views at 70 % lines and 60 % branches. | Untested UI. |
| e2e (`test:ce:e2e`, 64) | The real server plus memory Mongo, in three Playwright projects: smoke, UI journeys (workspace, settings, mobile shell, Ask) and axe scans of 18 pages with and without data. | Browser-only behaviour: file choosers, pdf.js, preference persistence, session revocation, streaming, real layout and contrast. |
| Visual (`test:ce:visual`, 42) | 14 screens × 3 projects. | Style regressions. |
| Static gates | `type-check:*`, `lint:ce`, `lint:ce:styles`, `format:ce:check`, `check:ce-ui`, `check:ce-hygiene`, `check:import-boundaries`, `validate:ce-routes`, `check:ce-env-contract`. | Regressions of every ratchet and boundary. |

### 7.2 Sandbox-only checks (not in the repo; copies are in `deliverables/sandbox-tools/`)

Before the real server could run, the **built** app was served with the web suite's fake API
(`mock-server.ts`) and probed in Chromium:

- axe scans of 41 states × 3 projects, using the same tags and policy as the e2e helper;
- before/after pixel diffs of every state for each style change (`diff.py`);
- keyboard walkthroughs: Tab order, dialog focus return, no traps;
- icon-button contrast;
- 320–390 px reflow;
- forced colours, WCAG 1.4.12 text spacing and reduced motion;
- a dry run of the journey steps.

These found the invisible phone buttons, the keyboard gaps and the contrast failures. Productising the
mock server and the axe scan is recommended for enterprise (§10.3).

### 7.3 What is not verified here

- **Not run:** the Docker build and `npm audit` (no network access in the sandbox).
- **Lockfile:** the committed `package-lock.json` must be regenerated on a normal registry. The sandbox
  used its own lockfile because the registry mirror lags (for example `@modelcontextprotocol/sdk`
  1.32.2 is not on it).
- **Visual baselines** are OS-specific. Linux baselines are supplied for reference; the team captures
  and commits its own.
- **Live model providers** are never called; only the scripted model and stubbed provider HTTP are
  used.

---

## 8. Open items and known limitations

| Item | Status / recommendation |
|------|------------------------|
| `package-lock.json` | Regenerate with `npx --yes npm@11.14.1 install` and commit. |
| Visual baselines | Capture on the team's OS (`npm run test:ce:visual:update`) and commit. |
| `@ai-sdk/anthropic` pin (4.0.71) | Remove after an agent-runtime release skips `custom` parts (patch supplied). |
| `AgentsView.vue` (829 lines) | Split it as `SettingsView` was split (list, editor, run history, schedules). |
| `DropZone` multi-mode props [C13] | Still renders four things through flags; split into button/menu-item variants. |
| `VerticalNavLink` unbound `mobile` model [C14] | Remove it. |
| Loading-state policy [U12] | Skeletons for lists and `LoadError` for failures exist; a single `LoadingState` for page-level spinners does not. |
| `index.html` CSS-layer order block [F8] | Still hand-maintained; add a test that compares it with Vuetify's layer list on upgrade. |
| `HandlebarsTextarea` [U4] | Kept by decision; `contenteditable` limits autofill, IME and mobile keyboards. |
| Chat | No token budget per answer (needs provider usage reporting). Old browser-only Site AI conversations are not migrated. No retention period for cross-site conversations. |
| 82 ESLint warnings | Pre-existing rules at *warn*; ratchet them to *error* one rule at a time. |
| Tracked Python wheels in the repo root | `dnspython-*.whl`, `pymongo-*.whl` and `pymongo_inmemory-*.whl` are committed in the baseline. They look like sandbox provisioning artefacts; remove them unless intended. |

---

## 9. Lessons learned

1. **Static review finds structure; execution finds behaviour.** The static review produced about 60
   well-evidenced findings. Real-browser scans then found that 19 of 21 pages failed axe and that
   primary buttons were invisible on phones — neither was in the review. The real server found
   harness origin bugs and the limiter stacking; a real provider path found an upstream
   incompatibility; a Windows user found the env-path bug. **Plan for every verification layer from
   day one**, even if some have to be added later.
2. **Guard rails before refactors.** Consolidating 248 `!important`s or 9 empty states without
   lint, a real component harness and visual baselines would have been guesswork. With them, every
   change was checked the same day.
3. **Test against the contract, not the implementation.** The fake API enforces the shared Zod
   contracts and records payloads. That turned "the form looks fine" into "the form sends the
   old name", a class of bug neither side's unit tests could see.
4. **Ratchet, don't freeze.** Counted budgets let cleanup proceed alongside features and prevent
   backsliding. The numbers only went down.
5. **One implementation per capability — including on the server.** Two AI loops and two tool sets
   meant two sets of access checks to audit. Merging them into one (`content-tools.ts` plus the
   runtime) removed a whole category of "fixed in one place only" risk.
6. **Residue is cheap to delete once it is measured.** Usage reports (CSS, Vue, reachable files,
   unused locals) made deletions uncontroversial. Without them, dead code is defended because
   "something might use it".
7. **Decide the keep-or-replace questions explicitly.** Recording "keep the search editor", "vendor
   the PDF viewer" and "Free icons only" up front prevented three large, risky rewrites.
8. **Scope tools precisely.** Running the formatter over the whole server tree (outside the
   `format:check` scope) rewrote 50+ unrelated files and had to be reverted. Keep formatter, lint and
   test scopes explicit in scripts, and run them only through the scripts.
9. **Environment and infrastructure code needs tests too.** Env loading, rate-limit mounting and the
   e2e harness origin had no tests. Each caused a real failure.
10. **Read the whole test summary, not just the pass count.** One web test's stubbed store actions
    made two views raise unhandled promise rejections. Every test still passed, but Vitest reported
    "4 errors" and exited non-zero. The sandbox runs were checked on the pass counts only, so the
    errors were first noticed on a reviewer's machine. Gate on the exit code. Also make
    source-scanning tests and hygiene checks point out leftover files from older copies
    (`check:ce-hygiene` now warns about untracked source files).
11. **Pin, test and report upstream problems.** When a dependency breaks, pin it with a test that
    fails on the broken version, write down why, and send the fix upstream.

---

## 10. Applying this to the enterprise application

### 10.1 Expected relevance of CE's findings

The CE UI was carved out of the enterprise web app (`clearideas-web`), so enterprise code is the
*origin* of most CE findings. Treat the table below as hypotheses to confirm with the measurements in
§10.2.

| CE finding class (§3) | Likely in enterprise? | Why |
|-----------------------|----------------------|-----|
| 3.3 Duplication with divergence | **Very likely, probably larger** | The duplicates came over with the code; enterprise has more features built on the same pieces. |
| 3.4 Cascade debt | **Very likely** | `overrides.scss`, the `--ci-*` tokens and the settings layout hacks are shared ancestry. |
| 3.5 Accessibility | **Very likely** | The same `IconCheckbox`, menus, rows, tiles and theme colours. |
| 3.6 Contract drift | **Likely** | Same stores and forms, same analytics action vocabulary; enterprise has its own server (`private-api`). |
| 3.10 Missing guard rails | **Check** | If enterprise has lint and type-checking, CE lost them in the port; if not, they are inherited. |
| 3.7 Env and infrastructure | **Check** | Per-router rate limiters and the env loader may be shared patterns. |
| 3.8 Bundle | **Likely** | Eager routes and full icon and highlight.js sets are inherited habits. |
| 3.1 / 3.2 / 3.9 Port-induced | **No, but relevant** | These features are live in enterprise. The list marks where CE and enterprise versions of the same components now differ. |

### 10.2 Measure first: an audit you can run in a day

Reproduce CE's numbers for enterprise before planning. Most of these are greps or the CE scripts with
paths changed.

| Measure | How (CE equivalent) |
|---------|---------------------|
| `!important` count, inline styles, explicit `any`, icon-name misuse | `scripts/check-ce-ui-conventions.mjs` with the enterprise paths |
| Unused global CSS selectors | `scripts/report-ce-css-usage.mjs` |
| Component usage and duplicates (same file names in different folders, near-identical templates) | `scripts/report-ce-vue-usage.mjs`; `find -name '*.vue' \| xargs basename \| sort \| uniq -d` |
| Unused TS and unreachable files, orphan SCSS | `scripts/check-ce-hygiene.mjs` (unused-locals, reachable-files and orphan-SCSS checks) |
| SFC type errors | `vue-tsc --noEmit` with `noUnusedLocals` |
| Routes without auth, validation or site-scope middleware | `scripts/validate-ce-routes.mjs` |
| Env variables read by the code but not passed by compose or not documented | `scripts/check-ce-env-contract.mjs` |
| Rate limiters mounted without a path | grep `router.use(\s*rateLimit` / `router.use(\s*limiter` |
| Entry bundle size and eager routes | `vite build`; grep the router for non-lazy `import` of views |
| Real-browser accessibility | `sandbox-tools/a11y-scan.mjs` against a running build (or the Playwright `expectPageAccessible` helper) |
| Font actually loaded | `document.fonts.check('16px "Inter Variable"')` in a browser |
| Client/server action and attribute names | Compare the string unions the UI filters on with what the server records (`activity` action names, `attributes.*` merge versus replace on PATCH) |

Output: an enterprise version of `ui-review.md` with counts and evidence. This is the baseline for the
ratchet.

### 10.3 A phased plan, adapted from CE

| Phase | Contents | Reuse from CE |
|-------|----------|---------------|
| **E0 — Guard rails** | ESLint (vue, typescript, vuejs-accessibility), Prettier, Stylelint; `vue-tsc`; convention ratchet seeded with the §10.2 counts; component harness with real Vuetify and axe; Playwright light/dark/mobile with axe; **productise a mock mode** (the built app plus an in-memory fake API) for reviewers and for a11y and visual scans without a backend. | `eslint.config.mjs`, `.prettierrc`, `.stylelintrc`, `test/web/harness/*`, `test/web/fixtures/{app,backend}.ts` (pattern), `test/e2e/helpers/*`, `playwright.config.ts`, the check scripts, `deliverables/sandbox-tools/mock-server.ts` and `a11y-scan.mjs` |
| **E1 — Visible defects** | Whatever the audit ranks P0: inaccessible checkboxes and menus, unloaded fonts, missing icons, theme-listener leaks. | `IconCheckbox`, `useAppTheme` fix, icon registry pattern (Pro packs for enterprise) |
| **E2 — Primitives** | One button, dialog, empty state, page header, side-nav layout, avatar, item link, load error, settings card. Migrate call sites. | Port CE's primitives, or share them (§10.4) |
| **E3 — Behaviour** | Preferences, shared filters and list/tile parity, destructive-action UX, dirty forms, search discoverability, splitting oversized views, typing ratchet. | Composables: `usePreferences`, `useContentFilters`, `useUnsavedChanges`; `config/roles.ts` pattern |
| **E4 — Visual consolidation** | Tokens, cascade layers, `!important` burn-down, layout utilities. **Only after visual baselines exist.** | `styles/overrides.scss` approach, `ci-base` layer, `token-parity.test.ts`, `theme-contrast.test.ts` |
| **E5 — Coverage and release** | Feature specs per area against a contract-enforcing fake API; real-server journeys; axe scans of pages with data; coverage gates; generated screenshots. | `feature-*.test.ts` structure, `ui-journeys.spec.ts`, `ui-a11y.spec.ts`, `visual.spec.ts`, `readme-screenshots.spec.ts` |
| **Server track (parallel)** | Contract-drift audit (§3.6); limiter scoping; env loading; permission checks on every tool and endpoint; one implementation per capability (content tools, chat on the agent runtime if enterprise has its own chat loop). | `services/content-tools.ts`, `services/chat/*`, `host-model.ts`, `lib/env.ts`, the API test patterns |

Sequence by verifiability, as CE did: anything checkable with component tests first, and styles only
under baselines.

### 10.4 Preventing re-divergence: share instead of copy

CE's primitives are now small, tested and documented. The enterprise refactor is the moment to decide
whether CE and enterprise **share** them.

- **`@clearideas/pdf-viewer` is already a package.** Enterprise can consume it; its `labels` prop maps
  onto enterprise i18n.
- **A `@clearideas/ui` package** could hold the primitives and composables listed in E2 and E3, the
  `ICONS` concept map (each edition registers its own packs: Free for CE, Pro for enterprise) and the
  test harness. Each edition keeps its own views.
- **Shared server services.** `content-tools.ts` and the chat-on-runtime service could move into
  `@clearideas/core`, with edition-specific access policies injected.
- **Keep the boundary checks** (`check-import-boundaries`, hygiene forbidden terms), but add the
  *reverse* check for shared packages: they must not contain edition-specific features.

The alternative — two copies maintained separately — is how CE ended up with the divergences in §3.3.

### 10.5 Decisions to take with the enterprise owners (before E0)

1. Icons: keep Pro? If so, use a registry of Pro packs with the same `ICONS` concept map, or a shared
   map with per-edition glyphs.
2. i18n: enterprise presumably has real translations. Primitives must take label props or use the i18n
   plugin, never hard-coded English.
3. Search editor and PDF viewer: keep them, as CE did, or replace them?
4. Chat and agents: does enterprise have its own chat loop? If so, should it move to the agent runtime,
   as CE's did?
5. A shared UI package: yes or no, and who owns it?
6. Visual language: preserved, as in CE, or is a redesign in scope? If a redesign is in scope, do it
   *after* E4, not during it.
7. Accessibility target: WCAG 2.2 AA, as CE used, plus the browser matrix.

### 10.6 Risks specific to enterprise

- **A larger surface:** features CE removed (archive, billing, OIDC/SAML, workflows, human-in-the-loop,
  public chat, vector and hybrid search — the terms the CE hygiene check forbids) each bring screens,
  state and server contracts.
- **i18n** multiplies copy-consistency issues [U7] and label-in-name checks.
- **Multi-tenant data** raises the stakes of contract drift such as the `siteId`-ignored analytics bug.
- **Pro icons** hide the missing-glyph class of bug. Keep the registry test anyway, so every name is
  known to resolve.
- **Baselines per OS and per locale** if screenshots include translated text.

---

## Appendix A — Finding index and status

IDs refer to `ui-review.md`. ✅ done · ◐ partly done or done differently by decision · ○ open.

| ID | Status | Note |
|----|--------|------|
| F1 | ✅ | Inter self-hosted; e2e check. |
| F2 | ✅ | Single token source; parity test. |
| F3 | ✅ | `!important` 248 → 40; ratchet. |
| F4 | ✅ | 57 → 0 unused selectors. |
| F5 | ✅ | Custom utility duplicates removed. |
| F6 | ✅ | `SideNavLayout`, `.page-bleed`. |
| F7 | ✅ | Shadow tokens with dark values. |
| F8 | ○ | Layer block kept; no upgrade guard yet. |
| F9 | ✅ | Per-scheme `theme-color`; `color-scheme`. |
| I1 | ✅ | Free equivalents. |
| I2 | ✅ | Prefixes normalised; shim removed. |
| I3 | ✅ | ~152 registered glyphs. |
| I4 | ✅ | Ratchet hard rule. |
| I5 | ✅ | `ICONS` concept map. |
| I6 | ✅ | Decorative icons hidden by default. |
| A1 | ✅ | Real checkbox. |
| A2 | ✅ | Icon buttons, `role="separator"` resize. |
| A3 | ✅ | `PageHeader`, titles, breadcrumb nav. |
| A4 | ✅ | Named icon buttons. |
| A5 | ✅ | `ItemLink`; keyboard access to tiles. |
| A6 | ✅ | `:focus-visible`; reduced motion. |
| A7 | ✅ | AA contrast in both themes. |
| A8 | ✅ | `BaseDialog` everywhere; toasts use role alert. |
| U1 | ✅ | Intents. |
| U2 | ✅ | `usePreferences`. |
| U3 | ✅ | Parity and pagination. |
| U4 | ◐ | Editor kept by decision; discoverability, semantics and resize fixed. |
| U5 | ✅ | `EmptyState` with calls to action. |
| U6 | ✅ | Confirm, undo, batched delete. |
| U7 | ✅ | `config/roles.ts`. |
| U8 | ✅ | Dirty state and guards. |
| U9 | ✅ | Real sessions. |
| U10 | ✅ | Copyable field. |
| U11 | ✅ | Redundant CE chip removed. |
| U12 | ◐ | Skeletons and `LoadError`; no single page-level loading primitive. |
| U13 | ✅ | Generated screenshots. |
| C1 | ✅ | One avatar, one side-nav layout. |
| C2 | ✅ | Filter composables. |
| C3 | ✅ | provide/inject. |
| C4 | ✅ | `BaseButton` rewritten (21 raw `VBtn` remain where Vuetify needs them). |
| C5 | ✅ | One dialog API. |
| C6 | ✅ | Status-icon leak and props fixed. |
| C7 | ✅ | App-level theme listener. |
| C8 | ✅ | Dead code removed; `TagOverflowRow` implements its limit. |
| C9 | ✅ | One load per navigation. |
| C10 | ✅ | No store mutation from templates. |
| C11 | ✅ | `any` → 0. |
| C12 | ◐ | `SettingsView` 406 → 121 lines; PDF viewer vendored; `AgentsView` still large. |
| C13 | ○ | `DropZone` still multi-mode. |
| C14 | ◐ | Active route fixed; unused `mobile` model remains. |
| H1 | ✅ | Full toolchain. |
| H2 | ✅ | No `:deep` with `!important` in `TableFooter`. |
| H3 | ✅ | 43 → 9. |
| H4 | ✅ | Tippy plugin and theme. |
| T1–T5 | ✅ | Harness, primitive and feature suites, UI e2e, setup, coverage gate. |

Defects beyond the review (found by execution) are listed in the CHANGELOG under *Web UI*,
*Configuration* and *AI chat (Ask)*.

## Appendix B — Tooling inventory

| Command | Purpose |
|---------|---------|
| `npm run type-check:ce` / `:ce:web` / `:core` | tsc and `vue-tsc` (web: `noUnusedLocals`) |
| `npm run lint:ce` / `lint:ce:styles` / `format:ce:check` | ESLint / Stylelint / Prettier (web, PDF viewer and tests) |
| `npm run check:ce-ui` | Convention ratchet (`scripts/ce-ui-conventions.baseline.json`) |
| `npm run check:ce-hygiene` | Unused TS, tracked artefacts, forbidden enterprise terms, orphan SCSS, reachable files |
| `npm run check:import-boundaries` | CE, core, contracts and enterprise import rules |
| `npm run validate:ce-routes` | Every route is authenticated (or explicitly public) and validated |
| `npm run check:ce-env-contract` | Every env variable the code reads is passed by `docker-compose.yml` and documented in `.env.example` |
| `npm run report:ce-css-usage` / `report:ce-vue-usage` | Usage reports for dead-code hunting |
| `npm run test:ce:unit` / `test:ce:api` / `test:ce:web[:coverage]` | Vitest suites |
| `npm run test:ce:e2e` / `test:ce:visual[:update]` / `docs:ce:screenshots` | Playwright (3 projects) |
| `deliverables/sandbox-tools/` (not in the repo) | Mock server (built app plus fake API), axe scan of 41 states × 3 projects, keyboard/reflow/forced-colours/text-spacing probes, pixel diff |

## Appendix C — Commit history of the final branch

`ui/batch-c-and-a11y` from `4fdab16 baseline` (Phases 0, 1, A and B were merged before it):

```
10f72ef chore(ui): prettier/stylelint clean; pin primary-on-background contrast (e2e axe finding)
b54e325 feat(settings): active sessions with real data (plan 3.8 step 2)
ae34435 test(web): primitive suite, fake backend + app fixtures, Sites feature spec (plan 4.1/4.2)
b6c2218 test(web): Site content feature spec; fix breadcrumbs, row-checkbox navigation, role gating
e11fd5e test(web): site Users tab feature spec; confirm member removal; label role selects
a7d1cf2 test(web): Settings, site Settings and Users feature specs; fix guard, save, a11y defects
37971bb test(web): Analytics feature spec; fix time-zone race and filter/picker accessibility
5f7dbe6 test(web): Login, Search and File view feature specs; small fixes they found
c7e9b29 test(web): App shell feature spec; load-error states instead of misleading empty states
a0d23b3 test(web): Agents feature spec; agents view fixes
4e6da2f test(web): media/branding/chat specs; coverage gates (plan 4.4)
390cc6c fix(ui): real-browser accessibility pass (axe in Chromium, light/dark/mobile)
121fd75 test(e2e): UI journeys (plan 4.3) and axe scans of pages with data
9be05f2 fix(settings): notification settings no longer open as 'Unsaved changes'
798fe6c style(tokens): single colour source (plan 2.1)
9b4ff54 style(ui): shrink overrides, CSS layers, SideNavLayout (plan 2.2, 2.7) + dead code
033edab refactor(ui): one Avatar component (plan 2.8)
5c5a27a test(e2e): README screenshots spec (plan 4.5)
b628967 docs(ui): conventions, testing, changelog and plan status after Batch C
0630a73 fix(a11y): label-in-name, landmarks, headings, warning contrast; agents time zone
1461c76 fix(a11y): keyboard access to rows/tiles, link semantics for section navs, not-available states
9fa3184 fix(a11y): dialog focus return, search results as links + Escape, no keyboard traps
444f0c1 fix(ui): invisible icon buttons on phones, clipped tabs/titles, favourite star contrast
b2fed2c fix(a11y): outline the current nav item in forced-colors mode
3803dcf docs(ui): plan status after the sandbox accessibility passes
8c03d30 chore(web): remove dead sortable remnants and unused header refs; fail type-check on unused locals
e03ed7f test(e2e): first real-server run — fix harness origin and second-user admission; analytics folder names
2261332 fix(config): read repo-root .env.ce on Windows; blank env vars no longer block fallbacks
7f497a8 Ask: chat across sites on the agent runtime, stored conversations, Site AI on the same engine
ba073c8 chore(deps): agent-runtime 0.6.0; pin @ai-sdk/anthropic to 4.0.71; reject runtime workspaces
```
