import { optionalTrimmedString, z } from './primitives.js'

export const SiteChatRequestSchema = z.strictObject({
  messages: z.array(z.unknown()).min(1, { error: 'messages are required' }),
  model: optionalTrimmedString(120),
})

export type SiteChatRequest = z.infer<typeof SiteChatRequestSchema>
