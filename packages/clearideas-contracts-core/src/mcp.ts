import { attributesSchema, requiredTrimmedString, z } from './primitives.js'

export const McpRequestBodySchema = z.union([
  z.looseObject({
    method: requiredTrimmedString('method', 120),
    params: attributesSchema.optional(),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    jsonrpc: z.literal('2.0').optional(),
  }),
  z.looseObject({
    tool: requiredTrimmedString('tool', 200),
    args: attributesSchema.optional(),
  }),
])

export type McpRequestBody = z.infer<typeof McpRequestBodySchema>
