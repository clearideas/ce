# Security Model

Community Edition is designed to be secure by default for self-hosted deployments, while remaining simple enough to inspect and operate.

## Authentication

Users sign in with email codes. Sessions are cookie-based and should run behind HTTPS in production.

## Authorization

Site permissions are role-based. Route middleware protects user management, site settings, file actions, analytics, MCP, and write operations.

## File Access

View and download endpoints use app routes, not public static file paths. Uploads use signed app URLs and raw byte uploads.

## MCP Access

MCP keys are hashed at rest. Tools enforce key scopes, site enablement, and permitted site access.

## AI Chat

AI chat is optional, site-scoped, and controlled by site settings. Default tests do not call live model providers.

## Production Checklist

- Set `NODE_ENV=production`.
- Set `HTTPS_REQUIRED=true` and run behind a reverse proxy or load balancer that terminates HTTPS and forwards `X-Forwarded-Proto=https`.
- Treat the bundled Caddy `tls internal` setup as local HTTPS only; use browser-trusted TLS for public deployments.
- Use a long random `BETTER_AUTH_SECRET`.
- Use a separate long random `FILE_ACCESS_TOKEN_SECRET`, or deliberately let it fall back to `BETTER_AUTH_SECRET`.
- Use SMTP, not log email, for real users.
- Back up MongoDB and local storage together.
- Run the release-readiness checks before publishing.
