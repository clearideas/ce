# Docker Compose

Docker Compose is the recommended way to evaluate Clear Ideas Community Edition without installing MongoDB locally.

## Run In 5 Minutes

Start a complete local stack with HTTPS, app, MongoDB, and Mailpit email capture:

```bash
docker compose -f docker-compose.yml -f docker-compose.quickstart.yml up -d --build
```

Open:

```text
https://localhost:4100
```

Open Mailpit to read sign-in codes and invites:

```text
http://localhost:8025
```

The quick-start stack uses local development secrets and creates the first owner as `admin@example.com`. For anything beyond a local trial, copy `.env.example` to `.env`, set real secrets, and use the production-shaped options below.

## Quick Start With Existing MongoDB

Use this when `.env` contains `MONGODB_URI` or the split hosted MongoDB variables.

```bash
cp .env.example .env
$EDITOR .env
docker compose --env-file .env up -d --build
```

The app listens on:

```text
https://localhost:4100
```

Caddy terminates local HTTPS and forwards requests to the app container. Your browser may show a certificate warning unless Caddy's local CA is trusted.

## Quick Start With Local MongoDB

Use this when you want Compose to run the complete local stack:

```bash
cp .env.example .env
$EDITOR .env
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  up -d --build
```

With this override, you can leave MongoDB env variables blank. The override sets `MONGODB_URI=mongodb://mongo:27017/clearideas_ce` inside the app container.

## Services

- `clearideas-ce`: the single-server app serving `/api` and the web UI
- `caddy`: local HTTPS reverse proxy in front of the app

The app container creates the first owner before starting the server. `FIRST_USER_EMAIL` is required in `.env` and `FIRST_USER_NAME` is optional:

```env
FIRST_USER_EMAIL=you@example.com
FIRST_USER_NAME=Your Name
```

## Volumes

- Uploaded files and search indexes are stored in named app volumes.

## Local MongoDB

Default Compose expects MongoDB to be configured through `.env`. To run local MongoDB through Docker Compose, add the local Mongo override:

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  up -d --build
```

MongoDB data is stored in a named Docker volume when this override is used.

## Updating

The app code is inside the Docker image. Data is not: MongoDB, uploaded files, and search indexes are stored in MongoDB and named Docker volumes.

To update, back up MongoDB and file storage, pull or unpack the latest Clear Ideas CE release, keep your existing `.env`, and rerun the same Compose command you used originally:

```bash
git pull
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  up -d --build
```

If you use external MongoDB, omit the local Mongo override:

```bash
git pull
docker compose --env-file .env up -d --build
```

Avoid `docker compose down -v` for routine updates. The `-v` flag removes named volumes and can delete local MongoDB, uploaded files, and search indexes.

## Local Mailpit Email

Default Compose is production-shaped and expects real SMTP settings. For local development without SMTP credentials, use the dev override:

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.local-mongo.yml \
  -f docker-compose.dev.yml \
  up -d --build
```

Open Mailpit at:

```text
http://localhost:8025
```

## Production Notes

For production, run behind a reverse proxy or load balancer that terminates HTTPS and forwards `X-Forwarded-Proto=https`, set a strong `BETTER_AUTH_SECRET`, use real SMTP for email delivery, back up MongoDB and local storage together, and persist the storage/search volumes.
