import type {
  CompletedRunRecord,
  RunCheckpoint,
  RunError,
  RunRecord,
  RunStore,
} from '@clearideas/agent-runtime'

export interface AgentRunScope {
  accountId: string
  createdBy: string
  agentId: string
  agentRevision: number
  siteId?: string
  source: 'manual' | 'scheduled'
  scheduleId?: string
  taskId?: string
}

export class MongoAgentRunStore implements RunStore {
  constructor(
    private readonly AgentRunModel: any,
    private readonly scope: AgentRunScope,
  ) {}

  async createRun(record: RunRecord): Promise<void> {
    await this.AgentRunModel.create({
      runId: record.runId,
      ...this.scope,
      record: clone(record),
      checkpointSequence: 0,
    })
  }

  async loadRun(runId: string): Promise<RunRecord | null> {
    const row = await this.AgentRunModel.findOne(this.runFilter(runId)).select('record').lean()
    return row ? clone(row.record) : null
  }

  async loadLatestCheckpoint(runId: string): Promise<RunCheckpoint | null> {
    const row = await this.AgentRunModel.findOne(this.runFilter(runId))
      .select('latestCheckpoint')
      .lean()
    return row?.latestCheckpoint ? clone(row.latestCheckpoint) : null
  }

  async resumeRun(
    runId: string,
    resumedAt: string,
    options?: { allowRunningTakeover?: boolean },
  ): Promise<number> {
    const current = await this.AgentRunModel.findOne(this.runFilter(runId)).select('record').lean()
    if (!current) throw new Error(`Run "${runId}" was not found.`)
    if (current.record.status === 'completed' || current.record.status === 'cancelled') {
      throw new Error(`Run "${runId}" cannot be resumed from ${current.record.status}.`)
    }
    if (current.record.status === 'running' && !options?.allowRunningTakeover) {
      throw new Error(`Run "${runId}" is already running.`)
    }

    const nextAttempt = Number(current.record.attempt ?? 1) + 1
    const result = await this.AgentRunModel.updateOne(
      {
        ...this.runFilter(runId),
        'record.status': current.record.status,
        'record.attempt': current.record.attempt ?? 1,
      },
      {
        $set: {
          'record.status': 'running',
          'record.attempt': nextAttempt,
          'record.updatedAt': resumedAt,
          updatedAt: new Date(resumedAt),
        },
        $unset: { error: 1 },
      },
    )
    if (result.modifiedCount !== 1) throw new Error(`Run "${runId}" changed while resuming.`)
    return nextAttempt
  }

  async saveCheckpoint(checkpoint: RunCheckpoint): Promise<void> {
    const expectedAttempt = checkpoint.attempt ?? 1
    const result = await this.AgentRunModel.updateOne(
      {
        ...this.runFilter(checkpoint.runId),
        'record.status': 'running',
        'record.attempt': expectedAttempt,
        checkpointSequence: checkpoint.sequence - 1,
      },
      {
        $set: {
          latestCheckpoint: clone(checkpoint),
          checkpointSequence: checkpoint.sequence,
          'record.state': clone(checkpoint.state),
          'record.updatedAt': checkpoint.createdAt,
          updatedAt: new Date(checkpoint.createdAt),
        },
      },
    )
    if (result.modifiedCount !== 1) {
      const existing = await this.loadLatestCheckpoint(checkpoint.runId)
      if (existing?.id === checkpoint.id && existing.sequence === checkpoint.sequence) return
      throw new Error(`Checkpoint ${checkpoint.sequence} could not be committed.`)
    }
  }

  async suspendRun(runId: string, suspendedAt: string, expectedAttempt: number): Promise<void> {
    await this.transition(runId, expectedAttempt, 'suspended', suspendedAt)
  }

  async completeRun(record: CompletedRunRecord): Promise<void> {
    const result = await this.AgentRunModel.updateOne(
      {
        ...this.runFilter(record.runId),
        'record.status': 'running',
        'record.attempt': record.attempt ?? 1,
      },
      { $set: { record: clone(record), updatedAt: new Date(record.updatedAt) }, $unset: { error: 1 } },
    )
    if (result.modifiedCount !== 1) throw new Error(`Run "${record.runId}" could not be completed.`)
  }

  async failRun(
    runId: string,
    error: RunError,
    failedAt: string,
    expectedAttempt: number,
  ): Promise<void> {
    await this.transition(runId, expectedAttempt, 'failed', failedAt, error)
  }

  async cancelRun(runId: string, cancelledAt: string, expectedAttempt: number): Promise<void> {
    await this.transition(runId, expectedAttempt, 'cancelled', cancelledAt)
  }

  private async transition(
    runId: string,
    expectedAttempt: number,
    status: 'suspended' | 'failed' | 'cancelled',
    at: string,
    error?: RunError,
  ) {
    const update: any = {
      $set: {
        'record.status': status,
        'record.updatedAt': at,
        updatedAt: new Date(at),
      },
    }
    if (error) update.$set.error = clone(error)
    const result = await this.AgentRunModel.updateOne(
      {
        ...this.runFilter(runId),
        'record.status': 'running',
        'record.attempt': expectedAttempt,
      },
      update,
    )
    if (result.modifiedCount !== 1) throw new Error(`Run "${runId}" could not become ${status}.`)
  }

  private runFilter(runId: string) {
    return { runId, accountId: this.scope.accountId }
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
