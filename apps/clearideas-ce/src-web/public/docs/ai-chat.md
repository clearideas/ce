# AI Chat

Community Edition can enable non-persisted site-scoped AI chat.

## Configuration

Set an allowed model and provider key:

```env
AI_CHAT_MODEL=openai:gpt-5.6-luna
AI_CHAT_MODELS=openai:gpt-5.6-luna
OPENAI_API_KEY=<key>
```

Anthropic models are also supported when `ANTHROPIC_API_KEY` is configured.

## Site Control

Site owners and admins control whether AI chat is enabled for a site. When disabled, the AI tab is hidden.

## Data Access

The chat uses the local app and MCP-style tools to inspect site content. It should only access content available to the current site/user context.

## Privacy

Chat messages are not persisted by the server. The browser may keep local state until the user clears the chat or the tab storage is cleared.
