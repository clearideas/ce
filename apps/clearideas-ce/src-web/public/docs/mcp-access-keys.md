# MCP and Access Keys

Community Edition exposes a Model Context Protocol endpoint at `/api/mcp`.

## Access Keys

Create MCP access keys from Settings. Keys are shown once when created and are stored hashed in MongoDB.

## Scopes

- `mcp:read`: list and retrieve permitted content.
- `mcp:write`: create folders and save text files where the user has write permission.

## Included Tools

- `clearideas.list_sites`
- `clearideas.list_content`
- `clearideas.get_site_metadata`
- `clearideas.get_content_metadata`
- `clearideas.search_content`
- `clearideas.retrieve_file_content`
- `clearideas.save_file`
- `clearideas.create_folder`
- `search`
- `fetch`

## Example Request

```bash
curl -X POST https://localhost:4100/api/mcp \
  -H "Authorization: Bearer $CLEAR_IDEAS_MCP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool":"clearideas.list_sites","args":{}}'
```

## Site Enablement

MCP access is controlled by site settings and role checks. A key cannot read or write content outside the sites available to its account and scopes.
