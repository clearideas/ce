# Local Development

Community Edition is developed as a workspace app using `@clearideas/core` and `@clearideas/ce`.

## Common Commands

```bash
npm install
npm run bootstrap:ce
npm run dev:ce
npm run build:ce
npm run type-check:ce
npm run test:ce
npm run test:ce:e2e
```

## Development Server

`npm run dev:ce` builds core, builds the web app once, and starts the CE server with file watching.

The API lives under `/api`. Non-API routes serve the Vue app and support browser refresh.

## First Owner And Seed Data

```bash
FIRST_USER_EMAIL=you@example.com npm run bootstrap:ce
```

The bootstrap script creates the first owner account against the configured MongoDB and is safe to rerun.

```bash
npm run seed:ce
```

The seed script creates demo data, including a demo site, folders, files, and optional access key data.

## Tests

Use `npm run test:ce` for the contributor-fast suite. Use `npm run test:ce:e2e` before release work.

## Boundaries

Do not import private app source into `packages/clearideas-core` or `apps/clearideas-ce`. Shared logic belongs below the route layer in core services, validators, schema factories, providers, and domain helpers.
