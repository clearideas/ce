# Configuration

Community Edition is configured with a small environment surface. Public Docker installs use `.env.example`; monorepo development may use `.env.ce.example`.

## Docker Quick Start Values

For the public Docker Compose setup, start with:

```env
APP_URL=http://localhost:4100
BETTER_AUTH_URL=http://localhost:4100
CADDY_SITE=http://localhost:4100
BETTER_AUTH_SECRET=<long-random-secret>
FILE_ACCESS_TOKEN_SECRET=<another-long-random-secret>
FIRST_USER_EMAIL=admin@example.com
FIRST_USER_NAME=Clear Ideas Admin
HTTPS_REQUIRED=false
CLEARIDEAS_DOCS_ENABLED=true
EMAIL_PROVIDER=smtp
EMAIL_FROM="Clear Ideas <noreply@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<user>
SMTP_PASS=<password>
```

Then choose MongoDB:

```env
# Existing MongoDB
MONGODB_URI=mongodb://mongo.example.com:27017/clearideas_ce

# Or hosted MongoDB split variables
MONGODB_HOST=
MONGODB_DATABASE_NAME=clearideas_ce
MONGODB_AUTH_MECHANISM=
MONGODB_USERNAME=
MONGODB_PASSWORD=
MONGODB_CERTIFICATE_BASE64=
```

If you use `docker-compose.local-mongo.yml`, leave MongoDB values blank. The override configures the app to use the local MongoDB container.

## Required For Production

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=4100
APP_URL=https://your-domain.example
BETTER_AUTH_SECRET=<long-random-secret>
FILE_ACCESS_TOKEN_SECRET=<another-long-random-secret>
MONGODB_URI=mongodb://mongo:27017/clearideas_ce
FIRST_USER_EMAIL=admin@your-domain.example
FIRST_USER_NAME=Clear Ideas Admin
HTTPS_REQUIRED=true
CLEARIDEAS_TRUST_PROXY=1
CLEARIDEAS_DOCS_ENABLED=false
EMAIL_PROVIDER=smtp
EMAIL_FROM="Clear Ideas <noreply@your-domain.example>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<user>
SMTP_PASS=<password>
```

## Local Defaults

Local source development without Caddy may use:

```env
APP_URL=http://localhost:4100
BETTER_AUTH_URL=http://localhost:4100
HTTPS_REQUIRED=false
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
MONGODB_URI=mongodb://localhost:27017/clearideas_ce
FIRST_USER_EMAIL=you@example.com
```

`FIRST_USER_EMAIL` is used by `npm run bootstrap:ce` and Docker Compose to create the first owner account. After users exist, unknown emails must be invited before they can sign in.

For production-shaped Docker startup, configure real SMTP in `.env`. For local development without SMTP credentials, use `docker-compose.dev.yml` to run Mailpit.

The app listens over HTTP inside the container. The local Docker quickstart uses HTTP on `localhost` to avoid local certificate warnings. In production, users should reach Clear Ideas over HTTPS.

If you terminate HTTPS at a reverse proxy or load balancer such as an AWS Application Load Balancer (ALB), keep `APP_URL` and `BETTER_AUTH_URL` set to the public `https://` URL, set `CLEARIDEAS_TRUST_PROXY=1`, and keep `HTTPS_REQUIRED=true` when the proxy forwards `X-Forwarded-Proto=https`.

If your proxy or network deliberately terminates HTTPS upstream but cannot provide `X-Forwarded-Proto=https`, you can set `HTTPS_REQUIRED=false`; only do this when direct access to the app container is blocked and users still reach Clear Ideas through HTTPS externally.

If you use the bundled Caddy service for a real domain, set `CADDY_SITE=https://your-domain.example` and configure DNS so Caddy can issue a browser-trusted certificate.

## Storage And Search

```env
STORAGE_ROOT=apps/clearideas-ce/data/storage
SEARCH_INDEX_ROOT=apps/clearideas-ce/data/search
```

Back up both directories with MongoDB. File metadata lives in MongoDB; object bytes and extracted text live in local storage.

## Auth Codes

```env
AUTH_CODE_LENGTH=6
AUTH_CODE_EXPIRES_IN=600
AUTH_CODE_ALLOWED_ATTEMPTS=5
```

## Optional AI Chat

```env
AI_CHAT_MODEL=openai:gpt-4.1-mini
AI_CHAT_MODELS=openai:gpt-4.1-mini,anthropic:claude-3-5-haiku-latest
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
```

If no AI model is configured, site AI chat remains unavailable.

## Bundled Operator Docs

Community Edition includes technical setup and operator docs under `/docs`. These are useful during setup, but they are not end-user help content. To hide the Documentation menu item and block direct `/docs` access, set:

```env
CLEARIDEAS_DOCS_ENABLED=false
```
