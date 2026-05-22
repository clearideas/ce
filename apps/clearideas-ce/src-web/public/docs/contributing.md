# Contributing

Thank you for helping improve Clear Ideas Community Edition.

## Development Setup

```bash
npm install
npm run build:core
npm run dev:ce
```

## Before Opening A Pull Request

```bash
npm run type-check:core
npm run type-check:ce
npm run test:ce
npm run check:import-boundaries
npm run check:ce-hygiene
```

## Architecture Rules

- Keep `packages/clearideas-core` reusable and app-blind.
- Keep `apps/clearideas-ce` independent from private app source.
- Put shared behavior below the route layer in services, validators, providers, schema factories, or domain helpers.
- Keep routes explicit in the app that owns them.

## Documentation

Docs in Community Edition should be written for the self-hosted CE app. Existing Clear Ideas docs may be used for reference, but public CE docs should not mention unavailable product areas.
