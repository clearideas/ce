# Agents

Clear Ideas CE can run small, portable prompt agents using `@clearideas/agent-runtime` 0.4.1. Open **Agents** in the main navigation to create an agent from the included JSON template, supply variables, choose a Site, and inspect run history.

See the [Clear Ideas Agent Runtime documentation](https://agent-runtime.clearideas.com/) for the portable manifest format and runtime concepts. CE intentionally supports only the compact subset documented below.

## Configure a model

Set a host-controlled model and its API key:

```env
AI_AGENT_MODEL=openai:gpt-5.6-luna
OPENAI_API_KEY=your-key
```

`AI_AGENT_MODEL` falls back to `AI_CHAT_MODEL`. Agent manifests must use `model.ref: default`; provider names, model IDs, options, and credentials cannot be selected by an agent.

## Supported manifests

CE intentionally supports a compact subset of the portable manifest:

- Prompt steps
- Variables and required overrides
- JEXL `when` conditions
- Sequential or limited parallel execution
- Read-only Site tools: `list_content`, `get_site_metadata`, `get_content_metadata`, `search_content`, and `retrieve_file_content`

Connections and other step types are rejected when the manifest is saved. A Site must be selected when a manifest declares Site tools. Access is checked again during every tool call, including scheduled runs.

## Schedules

Agents can run once, daily, weekly, or monthly in an IANA time zone. Scheduled tasks are persisted in MongoDB and claimed with a lease by the embedded worker.

```env
AGENT_SCHEDULER_ENABLED=true
AGENT_SCHEDULER_POLL_INTERVAL_MS=10000
```

The worker avoids overlapping occurrences of the same schedule and runs one missed occurrence after the server comes back. It does not replay every missed interval. A task contains an immutable snapshot of the agent manifest and variables from the time it was queued.

The worker currently runs in the web-server process. This keeps deployment simple and ensures Site search uses the server's local index manager. A later deployment can move the same host service and leased task processor to a dedicated process after local search-index writes are made safe for multiple processes.

## Run records

Run records and checkpoints are stored in MongoDB. Editing an agent increments its revision without changing prior run snapshots. Deleting an agent removes future schedules but retains its run history.
