# Testing

Community Edition includes unit, API, web, E2E, and coverage suites.

## Fast Suite

```bash
npm run test:ce
```

## Focused Suites

```bash
npm run test:ce:unit
npm run test:ce:api
npm run test:ce:web
npm run test:ce:e2e
npm run test:ce:coverage
npm run check:ce-hygiene
```

## API Tests

API tests run in-process with memory MongoDB, temporary local storage, temporary search indexes, and captured email templates.

## E2E Tests

The Playwright smoke suite builds the app, starts the real CE server against memory MongoDB, signs in with a captured email code, creates content, searches, opens docs, creates an MCP key, and checks critical deep links.

## Release Gates

Before public release, run:

```bash
npm run test:ce
npm run test:ce:e2e
npm run test:ce:coverage
npm run check:import-boundaries
npm run check:ce-hygiene
npm run export:ce-public -- --verify
```
