# Changelog

## Unreleased

### Search

- Fixed full-text search dropping valid results: multi-word queries now require every word (AND), fuzzy matching only applies to longer words, and results are no longer re-validated against a truncated snippet. Searching never rewrites the index.
- Fixed `@tag`, `@tags`, `@createdAt`, `@uploadedAt`, and custom metadata filters (`@expiryDate:2026`) returning nothing. Content tags are now searchable and metadata keys match case-insensitively.
- Fixed filename search silently examining only the first 200 files of a site/user. Filename and content-type predicates now run in the database with a bounded, deterministic scan.
- Fixed `@constructor:` / `@__proto__:` style queries causing a 500 error.
- Search indexes are now persisted atomically to a single versioned file with coalesced writes (`SEARCH_INDEX_FLUSH_DELAY_MS`). Unreadable indexes are quarantined and rebuilt automatically from MongoDB and local storage; indexes catch up on changes made while unloaded. Added `npm run reindex:ce`.
- Indexed text per file is capped (`SEARCH_INDEX_MAX_TEXT_BYTES`) and full text is no longer duplicated in the index files. Indexing runs in the background after uploads.
- Cross-site search results are merged by relevance instead of site order. Snippets cover each matched term.
- Deleting a site removes its search index and stored files; deleting a file removes its extracted-text companion object. Folder and site renames propagate to the index.
- MCP `search_content` arguments are validated (query length, site IDs, limit).
- Pending search index changes are flushed on `SIGTERM`/`SIGINT`.

### Search analytics

- Every search is now recorded as a `content-searched` activity across all channels (web, MCP, site chat, agents); site chat and agent searches were previously not recorded and MCP searches were recorded in a form no report could read.
- Multi-site searches are attributed only to the sites where they matched, one record per matched site with that site's own result count, so administrators never see search terms that concerned other sites. Searches that matched nowhere are kept as user-level audit records without site attribution.
- Added an admin-only **Search terms** report (`POST /analytics/search-terms`, `POST /site/:siteId/analytics/search-terms`, and an Analytics tab) showing term, search count, distinct users, zero-result count, last searched, and channel breakdown.
- `content-searched` is included in default activity counts; the analytics action filter now uses the real action names (`file-downloaded`, `file-uploaded`, `folder-created`, `content-deleted`) — previously selecting those filters matched nothing.
- Fixed site-scoped analytics routes (`/site/:siteId/analytics/...`) reporting on every site the caller administers instead of the requested site only (the validated `siteId` param was not recognised as a site filter).
- Removed unmounted activity-listing controller methods that would have exposed raw activity attributes.
- The `mcp-search-content` action name is replaced by `content-searched` with `source: 'ce-mcp'`.

### Extraction

- PDF text extraction is bounded by size (`PDF_EXTRACTION_MAX_BYTES`), pages (`PDF_EXTRACTION_MAX_PAGES`), time (`PDF_EXTRACTION_TIMEOUT_MS`), and concurrency (`PDF_EXTRACTION_CONCURRENCY`). Extracted text is stored only as a companion object, not in MongoDB. PDFs whose extraction fails remain searchable by name; failed extractions are retried on demand after a cool-down.

### Tooling

- Fixed Vitest configs resolving to an invalid `C:/C:/...` root on Windows ("No test files found").

### Access control

- Site memberships that have expired (`expiresAt`) or been declined no longer grant access to site content or search.

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
