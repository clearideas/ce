# Getting Started

Clear Ideas Community Edition is a local-first virtual data room for teams that need simple site-based file sharing, access control, search, activity logging, and optional AI/MCP workflows.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- MongoDB 7 or newer, or Docker Compose
- A browser that supports modern JavaScript

## Fastest Start

Use Docker Compose when you want a predictable local install. From the repository root, start the quick-start stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.quickstart.yml up -d --build
```

Then open:

```text
http://localhost:4100
```

Open Mailpit to read sign-in codes and invites:

```text
http://localhost:8025
```

The quick-start stack uses local development secrets, local MongoDB, and Mailpit. It creates the first owner as `admin@example.com`.

For anything beyond a local trial, create an env file and set real secrets:

```bash
cp .env.example .env
$EDITOR .env
```

Set `FIRST_USER_EMAIL`, `BETTER_AUTH_SECRET`, SMTP settings, and one MongoDB option.

If you already have MongoDB configured in `.env`, start the app and reverse proxy:

```bash
docker compose --env-file .env up -d --build
```

If you want Compose to run MongoDB too, use the local Mongo override:

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  up -d --build
```

Then open:

```text
http://localhost:4100
```

The app creates `FIRST_USER_EMAIL` as the first owner before startup. The local Docker quickstart uses HTTP on `localhost` to avoid local certificate warnings. For production, serve the public app URL over HTTPS through Caddy, a reverse proxy, or a load balancer.

For development without real SMTP credentials, add Mailpit:

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  -f docker-compose.dev.yml \
  up -d --build
```

Read development sign-in codes at:

```text
http://localhost:8025
```

## Local Source Start

From the repository root:

```bash
npm install
npm run build:core
npm run build:ce
npm run bootstrap:ce
npm run dev:ce
```

Create demo data when you want a pre-populated workspace:

```bash
npm run seed:ce
```

## Sign In

The app uses passwordless email codes. Docker Compose uses `FIRST_USER_EMAIL` to create the first owner before the server starts. Configure real SMTP in `.env` for production-shaped startup. For local development without SMTP credentials, use `docker-compose.dev.yml` to run Mailpit and capture sign-in codes at `http://localhost:8025`. `EMAIL_PROVIDER=log` is still available for tests or debugging.

## First Workflow

1. Sign in with your email address.
2. Create a site.
3. Upload a file or create a folder.
4. Invite another user to the site with a role.
5. Search by filename, metadata, or extracted text.
6. Create an MCP access key if you want local tool access.

## What Is Included

Community Edition includes sites, users, roles, folders, file upload/download/viewing, metadata and full-text search, activity logging, simple analytics, email notifications, MCP access keys, and optional site-scoped AI chat.
