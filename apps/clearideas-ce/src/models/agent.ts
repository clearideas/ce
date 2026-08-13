import type { Mongoose } from 'mongoose'
import { Schema } from 'mongoose'

export interface CeAgentModels {
  AgentModel: any
  AgentRunModel: any
  AgentScheduleModel: any
  AgentTaskModel: any
}

export function registerCeAgentModels(mongoose: Mongoose): CeAgentModels {
  const agentSchema = new Schema(
    {
      accountId: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      name: { type: String, required: true },
      description: { type: String, required: false, default: '' },
      manifest: { type: Schema.Types.Mixed, required: true },
      revision: { type: Number, required: true, default: 1 },
    },
    { timestamps: true },
  )
  agentSchema.index({ accountId: 1, updatedAt: -1 })

  const runSchema = new Schema(
    {
      runId: { type: String, required: true, unique: true, index: true },
      accountId: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      agentId: { type: Schema.Types.ObjectId, required: true, ref: 'CeAgent', index: true },
      agentRevision: { type: Number, required: true },
      siteId: { type: Schema.Types.ObjectId, required: false, ref: 'Site', index: true },
      source: { type: String, required: true, enum: ['manual', 'scheduled'] },
      scheduleId: { type: Schema.Types.ObjectId, required: false, ref: 'CeAgentSchedule' },
      taskId: { type: Schema.Types.ObjectId, required: false, ref: 'CeAgentTask' },
      record: { type: Schema.Types.Mixed, required: true },
      latestCheckpoint: { type: Schema.Types.Mixed, required: false },
      checkpointSequence: { type: Number, required: true, default: 0 },
      error: { type: Schema.Types.Mixed, required: false },
    },
    { timestamps: true },
  )
  runSchema.index({ accountId: 1, agentId: 1, createdAt: -1 })

  const scheduleSchema = new Schema(
    {
      accountId: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      agentId: { type: Schema.Types.ObjectId, required: true, ref: 'CeAgent', index: true },
      definition: { type: Schema.Types.Mixed, required: true },
      variables: { type: [Schema.Types.Mixed], required: true, default: [] },
      siteId: { type: Schema.Types.ObjectId, required: false, ref: 'Site' },
      enabled: { type: Boolean, required: true, default: true },
      nextRunAt: { type: Date, required: false, index: true },
      lastRunAt: { type: Date, required: false },
      lastError: { type: String, required: false },
    },
    { timestamps: true },
  )
  scheduleSchema.index({ enabled: 1, nextRunAt: 1 })
  scheduleSchema.index({ accountId: 1, agentId: 1, createdAt: -1 })

  const taskSchema = new Schema(
    {
      accountId: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
      agentId: { type: Schema.Types.ObjectId, required: true, ref: 'CeAgent', index: true },
      agentRevision: { type: Number, required: true },
      scheduleId: { type: Schema.Types.ObjectId, required: true, ref: 'CeAgentSchedule', index: true },
      siteId: { type: Schema.Types.ObjectId, required: false, ref: 'Site' },
      manifest: { type: Schema.Types.Mixed, required: true },
      variables: { type: [Schema.Types.Mixed], required: true, default: [] },
      scheduledFor: { type: Date, required: true },
      status: {
        type: String,
        required: true,
        enum: ['pending', 'claimed', 'completed', 'failed'],
        default: 'pending',
        index: true,
      },
      runId: { type: String, required: false },
      attempts: { type: Number, required: true, default: 0 },
      availableAt: { type: Date, required: true, default: Date.now, index: true },
      leaseOwner: { type: String, required: false },
      leaseExpiresAt: { type: Date, required: false, index: true },
      completedAt: { type: Date, required: false },
      error: { type: String, required: false },
    },
    { timestamps: true },
  )
  taskSchema.index({ scheduleId: 1, scheduledFor: 1 }, { unique: true })
  taskSchema.index({ status: 1, availableAt: 1, leaseExpiresAt: 1 })

  return {
    AgentModel: mongoose.models.CeAgent ?? mongoose.model('CeAgent', agentSchema),
    AgentRunModel: mongoose.models.CeAgentRun ?? mongoose.model('CeAgentRun', runSchema),
    AgentScheduleModel:
      mongoose.models.CeAgentSchedule ?? mongoose.model('CeAgentSchedule', scheduleSchema),
    AgentTaskModel: mongoose.models.CeAgentTask ?? mongoose.model('CeAgentTask', taskSchema),
  }
}
