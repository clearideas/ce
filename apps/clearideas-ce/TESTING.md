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
npm run test:ce:e2e
npm run test:ce:coverage
npm run check:ce-hygiene
```

`test:ce:e2e` installs the Playwright Chromium browser if the local/CI cache does not already have it.

## What The Suites Cover

- `test:ce:unit` covers reusable core/domain helpers, import boundaries, provider behavior, and the per-site MiniSearch index.
- `test:ce:api` starts the CE Express app in-process with `mongodb-memory-server`, temp local storage, temp search indexes, and a captured email provider for auth/invite codes.
- `test:ce:web` uses `jsdom` and Vue Test Utils for frontend utilities and behavior-sensitive components.
- `test:ce:e2e` builds the CE web app, starts the real CE server against memory Mongo, signs in through the email-code flow, and smoke-tests critical browser/API workflows.
- `test:ce:coverage` emits coverage under `coverage/ce*` for CE and core source.
- `check:ce-hygiene` fails on unused TypeScript locals/parameters, forbidden CE/core source terms, orphan SCSS partials, and source-boundary hygiene regressions.

## Test Harness

The API and E2E suites use `apps/clearideas-ce/test/harness/runtime.ts`.

The harness provides:

- isolated memory Mongo per run;
- temporary storage and search directories;
- temporary frontend `index.html` for API fallback tests;
- captured log email templates for auth codes and invites;
- signed-in Supertest helpers;
- worker-safe runtime startup with notification polling disabled by default.

## Contributor Notes

- No test should import private product API source from `src/`.
- No test should require private product env files, `.env.ce`, OpenAI, Anthropic, SES, Redis, S3, or paid-edition services.
- AI provider calls should stay mocked or exercised only through provider-disabled/safe UI paths by default.
- Use API integration tests for backend contracts, and reserve Playwright for a small user-critical smoke path.
