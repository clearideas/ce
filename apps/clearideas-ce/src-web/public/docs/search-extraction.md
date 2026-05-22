# Search and Extraction

Community Edition includes simple local search designed for self-hosted deployments.

## Search Types

- Filename search
- Metadata search such as `@contentType:application/pdf`
- Full-text search for text files and extracted PDF text

## Metadata Syntax

Examples:

```text
@contentType:application/pdf
@name:invoice
GMV @contentType:application/pdf
```

## Full-Text Indexes

Search indexes are maintained per site with MiniSearch and stored locally under `SEARCH_INDEX_ROOT`. Indexes are loaded on demand and unloaded when idle.

## PDF Text Extraction

PDF uploads trigger a lightweight text extraction pass. Extracted text is stored as an internal companion text object and indexed for search and MCP retrieval. The companion object is implementation detail and is not shown as normal content.

## Operational Note

If search results look stale after manual data changes, re-upload or re-index affected files. A full re-index command can be added later for larger installations.
