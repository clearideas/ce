# AI Chat

Community Edition can answer questions about your documents with a model you configure. There are two places to ask:

- **Ask** (main navigation): one question box over every site you can read that has AI chat turned on, or over one site you choose when you start the conversation.
- A site's **AI** tab: conversations about that site only.

Answers stream in and list the files they are based on; each source links to the file. Both places use the same assistant, and every conversation is listed under **Ask**.

## Configuration

Set a model and the provider's key, then restart Clear Ideas:

```env
AI_CHAT_MODEL=openai:gpt-5.6-luna
AI_CHAT_MODELS=openai:gpt-5.6-luna
OPENAI_API_KEY=<key>
```

- `AI_CHAT_MODEL` is the default model, in `provider:model` form (`CHAT_MODEL` is read as a fallback).
- `AI_CHAT_MODELS` is an optional comma-separated list of models users may choose from; a model picker appears when it lists more than one.
- Anthropic models are supported when `ANTHROPIC_API_KEY` is set (for example `anthropic:claude-sonnet-5`).
- Chat runs on the Clear Ideas agent runtime, the same engine as Agents, but with its own model setting: `AI_AGENT_MODEL` is not used for chat.

Requests to `/api/chat` are rate limited per client (`CLEARIDEAS_CHAT_RATE_LIMIT_LIMIT`, default 120 per `CLEARIDEAS_CHAT_RATE_LIMIT_WINDOW_MS`, default 15 minutes).

## Site Control

Site owners and admins turn AI chat on or off per site (site **Settings → AI**). When it is off, the site's AI tab is hidden and **Ask** does not search that site.

## Data Access

The assistant can list the sites of the conversation, search them (the same keyword and full-text search as the search box), list folders, read file metadata and read file text (including extracted PDF text). Every tool call is checked against the signed-in user's site access at the time of the question:

- a conversation over all sites uses the sites the user can read that have AI chat on;
- a site conversation needs read access to that site and AI chat on for it;
- files outside those sites cannot be read, even when asked for by id.

Searches made by the assistant are recorded as `content-searched` activity, like any other search.

## Privacy

Conversations are stored in MongoDB (collection `cechatconversations`) for the user who started them, so they can be reopened from any browser. Only that user can list, open, rename or delete them. A conversation keeps at most 200 messages; each answer sends the last 20 messages to the model as context.

Delete a conversation from **Ask** (⋮ → Delete). Deleting a site deletes its site conversations; conversations across sites are kept until their owner deletes them (there is no automatic retention period). The question and answer text, and the names of the source files, are sent to the configured model provider.
