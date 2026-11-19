import type {
  JsonObject,
  JsonValue,
  ModelAdapter,
  ModelRequest,
  ModelResult,
  ToolCall,
} from '@clearideas/agent-runtime'

/**
 * A deterministic chat model for API and browser tests. It behaves like a model that uses the chat
 * tools, driven by the question:
 *
 * - `read <contentId>`: reads that file and answers with its text (or the tool's error).
 * - anything else: searches for the question's longest word, reads the first
 *   result and answers citing the file by name; "No matching files." when nothing is found.
 *
 * `requests` keeps every request, so tests can assert what the model was given (history, tools).
 */
export class FakeChatModel implements ModelAdapter {
  readonly requests: ModelRequest[] = []

  async generate(request: ModelRequest): Promise<ModelResult> {
    // A copy: the runtime keeps appending to the same message array during the turn.
    this.requests.push({ ...request, messages: structuredClone(request.messages), signal: undefined })
    const question = lastUserText(request)
    const results = toolResults(request)
    const read = /^read\s+([a-f\d]{24})/i.exec(question)
    if (read) {
      if (results.length === 0) return callTool('retrieve_file_content', { contentId: read[1]! })
      const last = results.at(-1)!
      return answer(
        last.error ? `Tool error: ${last.error}` : `File text: ${String(last.output?.content ?? '')}`,
      )
    }
    const term = question
      .split(/\W+/)
      .reduce((longest, word) => (word.length > longest.length ? word : longest), '')
    if (results.length === 0) return callTool('search_content', { query: term })
    if (results.length === 1) {
      const hits = (results[0]!.output?.results as JsonObject[] | undefined) ?? []
      if (hits.length === 0) return answer('No matching files.')
      return callTool('retrieve_file_content', { contentId: String(hits[0]!.contentId) })
    }
    const file = results.at(-1)!.output?.contentInfo as JsonObject | undefined
    return answer(
      `According to ${String(file?.name ?? 'the file')}: ${String(results.at(-1)!.output?.content ?? '').trim()}`,
    )
  }
}

function lastUserText(request: ModelRequest) {
  const user = [...request.messages].reverse().find(message => message.role === 'user')
  return (user?.content ?? [])
    .map(part => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim()
}

/** Tool results since the last user message, oldest first. */
function toolResults(request: ModelRequest) {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return request.messages
    .slice(lastUser + 1)
    .flatMap(message =>
      message.role === 'tool'
        ? message.content.flatMap(part =>
            part.type === 'tool-result'
              ? [{ output: part.result.output as JsonObject | undefined, error: part.result.error?.message }]
              : [],
          )
        : [],
    )
}

let sequence = 0

function callTool(name: string, input: JsonObject): ModelResult {
  const call: ToolCall = { id: `call_${++sequence}`, name, input }
  return {
    transcript: [
      {
        id: `fake_${sequence}`,
        type: 'tool-call',
        role: 'assistant',
        content: [{ type: 'tool-call', call }],
        createdAt: new Date().toISOString(),
        model: 'test/fake',
      },
    ],
    toolCalls: [call],
    finishReason: 'tool-calls',
  }
}

function answer(text: string): ModelResult {
  return {
    output: text as JsonValue,
    transcript: [
      {
        id: `fake_${++sequence}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        createdAt: new Date().toISOString(),
        model: 'test/fake',
      },
    ],
    finishReason: 'stop',
  }
}
