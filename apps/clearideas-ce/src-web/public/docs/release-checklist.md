# Release Checklist

Use this checklist before making a public release.

## Source Hygiene

- Public export contains only CE-safe source.
- No private source paths are present.
- No private docs, private env files, generated builds, local data, or dependency folders are present.
- License, security, contributing, and code of conduct files exist.

## Build And Test

```bash
npm ci
npm run build:core
npm run build:ce
npm run test:ce
npm run test:ce:e2e
npm run check:import-boundaries
npm run check:ce-hygiene
```

## Runtime Smoke

- Docker Compose starts successfully.
- `/api/health` returns OK.
- `/docs` opens from the profile menu.
- Sign-in code flow works.
- A user can create a site.
- A user can upload, view, download, and search a file.
- MCP access key creation and `clearideas.list_sites` work.

## Production Readiness

- HTTPS is enabled.
- Strong auth secret is set.
- SMTP is configured.
- Backup/restore procedure is documented.
- AI keys are optional and not required for core app startup.
