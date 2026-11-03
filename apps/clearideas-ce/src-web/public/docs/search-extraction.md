# Search and Extraction

Community Edition includes simple local search designed for self-hosted deployments.

## Search Types

- Filename search
- Metadata search such as `@contentType:application/pdf`
- Full-text search for text files and extracted PDF text

Multi-word queries match files that contain **all** of the words (in the name, content type, or text). Words match by prefix (`inv` finds `invoice`), and words of five or more characters tolerate a small typo. Punctuation is ignored, so `annual report` finds `Annual_Report.pdf`.

Results from every site you can access are merged by relevance. Site search (`/api/site/:siteId/search`) and folder search (`/api/site/:siteId/folder/:id/search`) are scoped accordingly; folder search returns files directly inside the folder.

## Metadata Syntax

Filters have the form `@key:value` (quote values containing spaces: `@fullName:"Jane Doe"`). Values match case-insensitively as substrings, and can be combined with plain text.

Built-in keys:

| Key | Matches |
| --- | --- |
| `@name` | file name |
| `@contentType` | MIME type, e.g. `@contentType:pdf` |
| `@folder` / `@folderName` | containing folder name |
| `@site` / `@siteName` | site name |
| `@tag` / `@tags` | content tags and site tags |
| `@createdAt`, `@uploadedAt`, `@updatedAt` | ISO dates, e.g. `@createdAt:2026-02` |

Any other key looks up the file's custom metadata (`attributes.metadata`), e.g. `@expiryDate:2026`.

Examples:

```text
@contentType:application/pdf
@name:invoice
GMV @contentType:application/pdf
@tag:finance @createdAt:2026
```

## Full-Text Indexes

Search indexes are maintained per site with MiniSearch and stored locally under `SEARCH_INDEX_ROOT`. Indexes are loaded on demand and unloaded when idle.

The index is a **cache**, not a system of record. File metadata lives in MongoDB and file bytes plus extracted text live in local storage; an index can always be recreated from them:

- If a site's index file is missing or unreadable, it is quarantined (`index.json.corrupt-<timestamp>`) and rebuilt automatically the first time the site is searched.
- When an index is loaded, files changed since it was last saved are picked up automatically.
- Files found by the database search but missing from the index are indexed in the background.
- Index writes are coalesced (`SEARCH_INDEX_FLUSH_DELAY_MS`) and written atomically; pending changes are flushed on shutdown (`SIGTERM`/`SIGINT`).

Indexing runs in the background after uploads, so very recent uploads may take a moment to appear in full-text results. Each file contributes at most `SEARCH_INDEX_MAX_TEXT_BYTES` of text to the index.

### Rebuilding

To rebuild indexes explicitly, for example after restoring data or upgrading across an index format change:

```bash
npm run reindex:ce                 # every site
npm run reindex:ce -- <siteId>     # one or more sites
```

In a Docker Compose deployment run it inside the app container:

```bash
docker compose exec clearideas-ce node apps/clearideas-ce/dist/scripts/reindex.js [siteId ...]
```

Deleting a site removes its index and stored text; deleting a file removes its index entry and extracted-text companion object.

## PDF Text Extraction

PDF uploads trigger a text extraction pass in the background, bounded by `PDF_EXTRACTION_CONCURRENCY`. Extracted text is stored as an internal companion object in local storage and indexed for search and MCP retrieval; it is not stored in MongoDB. The companion object is an implementation detail and is not shown as normal content.

Extraction outcomes are recorded on the file:

- `complete` – text extracted
- `limited` – text extracted from the first `PDF_EXTRACTION_MAX_PAGES` pages only
- `unsupported` – no text layer, or the PDF exceeds `PDF_EXTRACTION_MAX_BYTES`
- `failed` – extraction errored or exceeded `PDF_EXTRACTION_TIMEOUT_MS`; retried on demand after `PDF_EXTRACTION_RETRY_FAILED_AFTER_MS`

Files whose extraction did not produce text remain searchable by name and metadata.

## Operational Note

If search results look stale after manual data changes, search the affected site (changes are picked up automatically) or run `npm run reindex:ce`.
