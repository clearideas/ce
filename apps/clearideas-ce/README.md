# Clear Ideas CE

Single-server CE app with API under `/api` and a Vue frontend served from the same server.

## Run

From repo root:

```bash
npm install
npm run build:ce
npm run dev:ce
```

Seed and smoke:

```bash
npm run seed:ce
npm run smoke:ce
```

`seed:ce` needs a reachable MongoDB from the env below. `smoke:ce` expects the CE server to already be running and defaults to `http://localhost:4100`.

Environment:

1. Copy `.env.ce.example` to `.env.ce` (or `.env.ce.local`).
2. Set only the minimal variables listed below.
3. Do not use private product environment files for Community Edition startup.

Minimal variables:

- `HOST` (default `localhost`)
- `PORT` (default `4100`)
- `APP_URL` (default `http://localhost:4100`; used in email links)
- `STORAGE_ROOT` (default `apps/clearideas-ce/data/storage`)
- `HTTPS_REQUIRED` (defaults to `true` only when `NODE_ENV=production`; set `false` for local/dev)
- `BETTER_AUTH_SECRET` (required for production; use a long random value)
- `FILE_ACCESS_TOKEN_SECRET` (optional separate long random value; falls back to `BETTER_AUTH_SECRET`)
- `BETTER_AUTH_URL` (optional; defaults to `APP_URL`)
- `AUTH_CODE_LENGTH`, `AUTH_CODE_EXPIRES_IN`, `AUTH_CODE_ALLOWED_ATTEMPTS`
- Optional social login vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `EMAIL_PROVIDER` (`log` or `smtp`; defaults to `log`)
- `EMAIL_FROM` (required for `smtp`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` (required as applicable for `smtp`)
- `NOTIFICATIONS_ENABLED` and `NOTIFICATION_POLL_INTERVAL_MS` for the simple CE email notification worker
- Optional site AI chat:
  - `AI_CHAT_MODEL` in `provider:model` format, for example `openai:gpt-4.1-mini` or `anthropic:claude-3-5-haiku-latest`
  - `AI_CHAT_MODELS` optional comma-separated allow-list; defaults to `AI_CHAT_MODEL`
  - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for the selected provider
- Mongo using one of:
  - `MONGODB_URI`
  - or Atlas split vars (`MONGODB_HOST`, `MONGODB_DATABASE_NAME`, `MONGODB_AUTH_MECHANISM`, auth credentials)

For local email capture, run Mailpit and set:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM="Clear Ideas <noreply@clearideas.local>"
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
```

Default URL: `http://localhost:4100`

- API health: `http://localhost:4100/api/health`
- Web app: `http://localhost:4100/`
- Bundled docs: `http://localhost:4100/docs`

## Local Login

- Set `FIRST_USER_EMAIL` and run `npm run bootstrap:ce` to create the first owner.
- Run `npm run seed:ce` only when you want demo data.
- Open `/login`, send a sign-in code to your owner email, then read the code from the log email output or SMTP inbox.

## Included CE Flows

- Session auth (local cookie session)
- Better Auth email-code authentication
- Invite and resend-invite emails with one-time sign-in codes
- Optional GitHub/Google social provider config
- Account context (`/api/account/me`)
- Sites list/create
- Folder create inside site
- File upload target + upload + download (local disk)
- Filename search through `/api/site/:siteId/search`
- Access key CRUD
- MCP-lite list/search using access keys
- Activity logging through `POST /api/activities`
- Analytics-lite reports
- Basic notification send/template endpoints
- Non-persisted site-scoped AI chat using AI SDK and the local CE MCP tools when `AI_CHAT_MODEL` is configured
- SPA fallback for non-API routes

## Frontend

The CE frontend lives in `apps/clearideas-ce/src-web` and builds into `apps/clearideas-ce/web`, which is what the Express server serves. It follows the Clear Ideas visual shell with a smaller CE feature set.

## Docker

The public export includes Docker Compose for the production-shaped startup path. With an existing MongoDB configured in `.env`:

```bash
docker compose --env-file .env up -d --build
```

For a complete local stack with MongoDB:

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  up -d --build
```

For development email capture with Mailpit, add `docker-compose.dev.yml` and open `http://localhost:8025`.

Open the app at `https://localhost:4100`.

### Updating Docker Deployments

The CE app code is rebuilt into the Docker image. MongoDB data, uploaded files, and search indexes live in MongoDB and named volumes, so routine updates should recreate containers without removing volumes:

```bash
git pull
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  up -d --build
```

Use the same Compose files you used to start the deployment. Do not use `docker compose down -v` for routine updates unless you intentionally want to delete named volumes.

## Env Source of Truth

- Use the public root `.env.example` for Docker/Compose deployments.
- During monorepo development, use the repo-level `.env.ce.example` as the Community Edition template.

## Public Release

Community Edition public exports are generated with:

```bash
npm run export:ce-public -- --target ../clearideas-ce-export --verify
```

The public package uses AGPL-3.0-only licensing and includes a clean README, Docker Compose setup, CI workflow, bundled docs, and release-readiness checks.
