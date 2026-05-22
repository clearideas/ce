# @clearideas/contracts-core

Browser-safe Zod schemas and TypeScript types for Clear Ideas common request payloads.

This package is the shared contract layer used by Clear Ideas Community Edition, shared core services, and browser clients that need to validate request bodies before calling the API. It contains only portable request DTO contracts: no Express middleware, database models, server configuration, Node-only helpers, or route handlers.

## What Belongs Here

- Request body schemas shared by CE/community and enterprise surfaces.
- Primitive contract helpers such as IDs, names, paging, schedules, and shared enum-like values.
- Types inferred from those schemas for client and service code.
- Contracts that are safe to import in browser bundles.

## What Does Not Belong Here

- Enterprise-only request shapes. Put those in `@clearideas/contracts-enterprise`.
- Response DTOs, database/domain models, or persistence concerns.
- API route validators that depend on Express, middleware state, authentication state, or server config.
- Node-only imports such as `fs`, `path`, process-specific helpers, or server-side SDKs.

## Install

Published releases are available from GitHub Packages:

```sh
npm install @clearideas/contracts-core
```

Consumers need the Clear Ideas GitHub Packages registry configured:

```ini
@clearideas:registry=https://npm.pkg.github.com/
```

## Usage

```ts
import {
  SiteCreateRequestSchema,
  type SiteCreateRequest,
} from '@clearideas/contracts-core'

const payload: SiteCreateRequest = SiteCreateRequestSchema.parse({
  site: {
    name: 'Investor Relations',
  },
})
```

Use the exported schemas at API boundaries, client submit points, tests, and shared service edges. Prefer schema inference over hand-written duplicate interfaces:

```ts
import { z } from 'zod'
import { SitePatchRequestSchema } from '@clearideas/contracts-core'

type SitePatchRequest = z.infer<typeof SitePatchRequestSchema>
```

## Export Surface

The package exports a single root module:

```ts
import { ... } from '@clearideas/contracts-core'
```

Subpath imports are intentionally not part of the public API. Add new exports through `src/index.ts` so consumers have one stable import surface.

Current contract areas include:

- access keys
- accounts
- activity
- analytics
- authentication codes
- chat
- content, files, and folders
- MCP
- notifications
- profiles
- schedules
- sites, site users, users, and user groups

## Development

From the repository root:

```sh
npm run build:contracts:core
npm run type-check:contracts:core
```

The build uses TypeScript project references and emits `dist/` for publishing. Release automation publishes the package with the release tag version, for example `v2.1.1` becomes `@clearideas/contracts-core@2.1.1`.

## Boundary Rules

`@clearideas/contracts-core` is allowed to be imported by:

- `@clearideas/core`
- Clear Ideas Community Edition
- enterprise contracts
- browser clients and tests

It must not import `@clearideas/contracts-enterprise` or any server-only API modules. The import-boundary checks enforce this direction.
