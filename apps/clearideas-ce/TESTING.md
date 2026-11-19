# Clear Ideas Community Edition Testing

The CE test suite is designed to run without private product environment variables and without a local MongoDB service.

## Commands

Run the fast contributor suite:

```bash
npm run test:ce
```

Run focused suites:

```bash
npm run test:ce:unit
npm run test:ce:api
npm run test:ce:web
npm run test:ce:web:coverage
npm run test:ce:e2e
npm run test:ce:visual
npm run test:ce:coverage
npm run check:ce-hygiene
```

`test:ce:e2e` installs the Playwright Chromium browser if the local/CI cache does not already have it.

## What The Suites Cover

- `test:ce:unit` covers reusable core/domain helpers, import boundaries, provider behavior, and the per-site MiniSearch index.
- `test:ce:api` starts the CE Express app in-process with `mongodb-memory-server`, temp local storage, temp search indexes, and a captured email provider for auth/invite codes.
- `test:ce:web` uses `jsdom` and Vue Test Utils for frontend utilities and components. Component tests mount through `test/web/harness` (`mountWithVuetify`), which installs the real Vuetify instance, a memory router, a testing Pinia and `vue-tippy`, and exposes `expectNoA11yViolations()` (axe-core). Do not stub `V*` components in new tests.
  Feature specs (`test/web/feature-*.test.ts`) mount the whole app at a route (`mountApp` in `test/web/fixtures/app.ts`) against an in-memory fake of the CE API (`test/web/fixtures/backend.ts`), so user journeys — sites, content, users, settings, analytics, agents, search, file view, login, the app shell — are covered without a browser or server.
- `test:ce:web:coverage` runs the same suite with coverage and enforces thresholds for `components/**` and `views/**` (70 % lines, 60 % branches). CI runs this variant.
- `test:ce:e2e` builds the CE web app, starts the real CE server against memory Mongo, signs in through the email-code flow, and smoke-tests critical browser/API workflows. `ui-journeys.spec.ts` walks the main journeys (workspace, settings, mobile shell, Ask) and `ui-a11y.spec.ts` runs axe on every page, with and without data (`helpers/seed.ts` seeds sites, folders, uploads and a multi-page PDF through the API). It runs three Playwright projects — `desktop-light` (all specs), `desktop-dark` and `mobile-light` (UI/visual specs only) — and `test/e2e/helpers/ui.ts` provides `signInViaForm`, `expectPageAccessible` (axe) and `expectToast`.
- `test:ce:visual` compares the `@visual` screenshots with the committed baselines (`test:ce:visual:update` re-captures them after an approved change).
- `test:ce:coverage` emits coverage under `coverage/ce*` for CE and core source.
- `check:ce-hygiene` fails on unused TypeScript locals/parameters, forbidden CE/core source terms, orphan SCSS partials, and source-boundary hygiene regressions.

Chat tests never call a provider. `test/harness/fake-chat-model.ts` (`FakeChatModel`) is a scripted `ModelAdapter` for the agent runtime: it searches for the question's longest word, reads the first result and answers citing it (or `read <contentId>` reads that file), so the real chat service, tools, access checks and stream are exercised. Pass it as `createTestCeRuntime({ chatModelAdapter })` (API: `test/api/chat.test.ts`) or `startCeServer({ chatModelAdapter })` (browser: the Ask journey in `ui-journeys.spec.ts`, the Ask scans in `ui-a11y.spec.ts`, the Ask README screenshot). `test/unit/ai-tool-schemas.test.ts` checks the chat/agent tool schemas against the OpenAI and Anthropic provider request paths with a stubbed `fetch`.

Browser specs start their server with `startCeServer()` (`test/e2e/helpers/server.ts`): it picks a free port and configures the runtime for that origin, so Better Auth's origin checks behave as in production. CE admits only the first user and invited addresses; `signInViaApi`/`signInViaForm` admit any further person as an invited member (`ensureInvited`).

## Test Harness

The API and E2E suites use `apps/clearideas-ce/test/harness/runtime.ts`.

The harness provides:

- isolated memory Mongo per run;
- temporary storage and search directories;
- temporary frontend `index.html` for API fallback tests;
- captured log email templates for auth codes and invites;
- signed-in Supertest helpers;
- worker-safe runtime startup with notification polling disabled by default.

## UI Conventions

`npm run check:ce-ui` enforces the UI debt ratchet described in `docs/ui-conventions.md`. If it reports that a count dropped below its baseline, run `node scripts/check-ce-ui-conventions.mjs --update-baseline` from the repo root and commit `scripts/ce-ui-conventions.baseline.json`.

## Contributor Notes

- No test should import private product API source from `src/`.
- No test should require private product env files, `.env.ce`, OpenAI, Anthropic, SES, Redis, S3, or paid-edition services.
- AI provider calls should stay mocked or exercised only through provider-disabled/safe UI paths by default.
- Use API integration tests for backend contracts, and reserve Playwright for a small user-critical smoke path.
