import { z } from './primitives.js'

export const agentIdParamSchema = z.strictObject({
  agentId: z.string().trim().regex(/^[a-f\d]{24}$/i),
})

export const agentRunIdParamSchema = z.strictObject({
  runId: z.string().trim().min(1).max(200),
})

export const agentScheduleIdParamSchema = z.strictObject({
  scheduleId: z.string().trim().regex(/^[a-f\d]{24}$/i),
})

export const agentCreateSchema = z.strictObject({
  manifest: z.unknown(),
})

export const agentUpdateSchema = z.strictObject({
  manifest: z.unknown(),
})

export const agentVariableOverrideSchema = z.strictObject({
  key: z.string().trim().min(1).max(120),
  value: z.unknown(),
})

export const agentRunCreateSchema = z.strictObject({
  variables: z.array(agentVariableOverrideSchema).max(100).default([]),
  siteId: z.string().trim().regex(/^[a-f\d]{24}$/i).optional(),
  execution: z.enum(['sequential', 'parallel']).optional(),
})

export const agentRunsQuerySchema = z.strictObject({
  agentId: z.string().trim().regex(/^[a-f\d]{24}$/i).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const onceScheduleSchema = z.strictObject({
  kind: z.literal('once'),
  runAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(100),
})

const dailyScheduleSchema = z.strictObject({
  kind: z.literal('daily'),
  time: timeSchema,
  timeZone: z.string().trim().min(1).max(100),
})

const weeklyScheduleSchema = z.strictObject({
  kind: z.literal('weekly'),
  time: timeSchema,
  timeZone: z.string().trim().min(1).max(100),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
})

const monthlyScheduleSchema = z.strictObject({
  kind: z.literal('monthly'),
  time: timeSchema,
  timeZone: z.string().trim().min(1).max(100),
  daysOfMonth: z.array(z.number().int().min(1).max(31)).min(1).max(31),
})

export const agentScheduleDefinitionSchema = z.discriminatedUnion('kind', [
  onceScheduleSchema,
  dailyScheduleSchema,
  weeklyScheduleSchema,
  monthlyScheduleSchema,
])

export const agentScheduleCreateSchema = z.strictObject({
  definition: agentScheduleDefinitionSchema,
  variables: z.array(agentVariableOverrideSchema).max(100).default([]),
  siteId: z.string().trim().regex(/^[a-f\d]{24}$/i).optional(),
  enabled: z.boolean().default(true),
})

export const agentScheduleUpdateSchema = agentScheduleCreateSchema

export type AgentScheduleDefinition = z.infer<typeof agentScheduleDefinitionSchema>
export type AgentRunCreate = z.infer<typeof agentRunCreateSchema>
export type AgentScheduleCreate = z.infer<typeof agentScheduleCreateSchema>

export const AgentCreateRequestSchema = agentCreateSchema
export const AgentUpdateRequestSchema = agentUpdateSchema
export const AgentRunCreateRequestSchema = agentRunCreateSchema
export const AgentScheduleCreateRequestSchema = agentScheduleCreateSchema
export const AgentScheduleUpdateRequestSchema = agentScheduleUpdateSchema
