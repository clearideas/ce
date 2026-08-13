# Changelog

## v0.2.0 — 2026-08-13

- Added lightweight agents powered by `@clearideas/agent-runtime` 0.4.1.
- Added manual agent runs with streamed results, durable history, output inspection, and resumable run records.
- Added portable JSON manifests with syntax highlighting, variables, conditions, and a deliberately limited prompt-step surface.
- Added tenant-scoped, read-only Site tools for search, retrieval, and content metadata.
- Added once, daily, weekly, and monthly schedules using the embedded leased-task worker.
- Added separate `AI_AGENT_MODEL` configuration with fallback to the AI chat model.
- Added agent API, manifest-policy, scheduling, UI, and browser end-to-end coverage.
- Updated production dependencies and release checks, including a guard against private repository references in public exports.

## v0.1.1 — 2026-08-12

- Improved standalone deployment compatibility, authentication, AI chat, MCP, and dependency security.

## v0.1.0 — 2026-05-22

- Initial Clear Ideas Community Edition release.
