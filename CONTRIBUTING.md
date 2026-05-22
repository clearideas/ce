# Contributing

Thanks for helping improve Clear Ideas Community Edition.

## Setup

```bash
npm install
npm run build:core
npm run dev:ce
```

## Before Submitting

```bash
npm run type-check:core
npm run type-check:ce
npm run test:ce
npm run check:import-boundaries
```

Run the E2E suite for changes touching auth, routing, docs, uploads, MCP, or the web shell:

```bash
npm run test:ce:e2e
```

## Architecture Rules

- Keep `packages/clearideas-core` app-blind and reusable.
- Keep `apps/clearideas-ce` independent from non-Community source.
- Share behavior below the route layer through services, validators, schema factories, providers, and domain helpers.
- Keep app route setup explicit.
- Do not commit generated artifacts, local data, `dist`, `web`, or `node_modules`.
