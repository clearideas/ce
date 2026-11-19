/**
 * The first of `names` that is set to a non-blank value, trimmed.
 *
 * A blank variable means "not set": `.env.example` ships `AI_AGENT_MODEL=`, and docker-compose passes
 * `${AI_AGENT_MODEL:-}` (an empty string) for anything the operator left out. With `??` an empty
 * string counts as set, so documented fallbacks (AI_AGENT_MODEL → AI_CHAT_MODEL,
 * BETTER_AUTH_URL → APP_URL) silently never applied.
 */
export function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}
