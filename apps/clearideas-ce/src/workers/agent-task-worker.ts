import type { AgentHostService } from '../services/agent/agent-host.js'
import { calculateNextAgentRunAt } from '../services/agent/schedule.js'

export interface AgentTaskWorkerContext {
  models: {
    AgentModel: any
    AgentScheduleModel: any
    AgentTaskModel: any
  }
  agentHost: AgentHostService
  now?: () => Date
  workerId?: string
  batchSize?: number
  maxAttempts?: number
  leaseMs?: number
  retryDelayMs?: number
}

export interface AgentTaskWorkerHandle {
  stop: () => void
}

export function startAgentTaskWorker(
  ctx: AgentTaskWorkerContext,
): AgentTaskWorkerHandle | undefined {
  if (String(process.env.AGENT_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'false') {
    return undefined
  }
  const intervalMs = numberOption(process.env.AGENT_SCHEDULER_POLL_INTERVAL_MS, 10_000, 1_000)
  let stopped = false
  let running = false
  const run = () => {
    if (stopped || running) return
    running = true
    processPendingAgentTasks(ctx)
      .catch(error => console.error('[ce-agent-worker] failed', error))
      .finally(() => {
        running = false
      })
  }
  const timer = setInterval(run, intervalMs)
  timer.unref?.()
  run()
  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}

export async function processPendingAgentTasks(ctx: AgentTaskWorkerContext) {
  await materializeDueSchedules(ctx)
  const batchSize = numberOption(ctx.batchSize, 5, 1, 50)
  for (let index = 0; index < batchSize; index += 1) {
    const task = await claimTask(ctx)
    if (!task) break
    await executeTask(ctx, task)
  }
}

async function materializeDueSchedules(ctx: AgentTaskWorkerContext) {
  const now = getNow(ctx)
  const schedules = await ctx.models.AgentScheduleModel.find({
    enabled: true,
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1 })
    .limit(50)
    .lean()

  for (const schedule of schedules) {
    const scheduledFor = new Date(schedule.nextRunAt)
    const agent = await ctx.models.AgentModel.findOne({
      _id: schedule.agentId,
      accountId: schedule.accountId,
    }).lean()
    if (!agent) {
      await ctx.models.AgentScheduleModel.updateOne(
        { _id: schedule._id, nextRunAt: schedule.nextRunAt },
        { $set: { enabled: false, lastError: 'Agent not found.' }, $unset: { nextRunAt: 1 } },
      )
      continue
    }

    const active = await ctx.models.AgentTaskModel.exists({
      scheduleId: schedule._id,
      status: { $in: ['pending', 'claimed'] },
    })
    if (!active) {
      try {
        await ctx.models.AgentTaskModel.create({
          accountId: schedule.accountId,
          createdBy: schedule.createdBy,
          agentId: agent._id,
          agentRevision: agent.revision,
          scheduleId: schedule._id,
          siteId: schedule.siteId,
          manifest: agent.manifest,
          variables: schedule.variables ?? [],
          scheduledFor,
          availableAt: now,
        })
      } catch (error: any) {
        if (error?.code !== 11000) throw error
      }
    }

    const nextRunAt =
      schedule.definition.kind === 'once'
        ? null
        : calculateNextAgentRunAt(schedule.definition, now)
    await ctx.models.AgentScheduleModel.updateOne(
      { _id: schedule._id, nextRunAt: schedule.nextRunAt },
      nextRunAt
        ? { $set: { nextRunAt }, $unset: { lastError: 1 } }
        : { $set: { enabled: false }, $unset: { nextRunAt: 1, lastError: 1 } },
    )
  }
}

async function claimTask(ctx: AgentTaskWorkerContext) {
  const now = getNow(ctx)
  const workerId = ctx.workerId ?? `ce-agent-worker-${process.pid}`
  const leaseMs = numberOption(ctx.leaseMs, 5 * 60_000, 10_000)
  return ctx.models.AgentTaskModel.findOneAndUpdate(
    {
      availableAt: { $lte: now },
      $or: [
        { status: 'pending' },
        { status: 'claimed', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'claimed',
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
      $inc: { attempts: 1 },
      $unset: { error: 1 },
    },
    { sort: { scheduledFor: 1 }, returnDocument: 'after', lean: true },
  )
}

async function executeTask(ctx: AgentTaskWorkerContext, task: any) {
  const now = getNow(ctx)
  try {
    let runId = ''
    await ctx.agentHost.execute(
      {
        agentId: String(task.agentId),
        accountId: String(task.accountId),
        userId: String(task.createdBy),
        siteId: task.siteId ? String(task.siteId) : undefined,
        variables: task.variables,
        source: 'scheduled',
        scheduleId: String(task.scheduleId),
        taskId: String(task._id),
        manifest: task.manifest,
        agentRevision: Number(task.agentRevision),
      },
      message => {
        if (message.kind === 'accepted') runId = message.runId
      },
    )
    await Promise.all([
      ctx.models.AgentTaskModel.updateOne(
        { _id: task._id, leaseOwner: task.leaseOwner },
        {
          $set: { status: 'completed', completedAt: now, runId },
          $unset: { leaseOwner: 1, leaseExpiresAt: 1, error: 1 },
        },
      ),
      ctx.models.AgentScheduleModel.updateOne(
        { _id: task.scheduleId },
        { $set: { lastRunAt: now }, $unset: { lastError: 1 } },
      ),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent task failed.'
    const maxAttempts = numberOption(ctx.maxAttempts, 3, 1, 10)
    if (Number(task.attempts) < maxAttempts) {
      const delay = numberOption(ctx.retryDelayMs, 30_000, 1_000)
      await ctx.models.AgentTaskModel.updateOne(
        { _id: task._id, leaseOwner: task.leaseOwner },
        {
          $set: {
            status: 'pending',
            availableAt: new Date(now.getTime() + delay * Number(task.attempts)),
            error: message,
          },
          $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
        },
      )
    } else {
      await ctx.models.AgentTaskModel.updateOne(
        { _id: task._id, leaseOwner: task.leaseOwner },
        {
          $set: { status: 'failed', completedAt: now, error: message },
          $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
        },
      )
    }
    await ctx.models.AgentScheduleModel.updateOne(
      { _id: task.scheduleId },
      { $set: { lastError: message } },
    )
  }
}

function getNow(ctx: AgentTaskWorkerContext) {
  return ctx.now?.() ?? new Date()
}

function numberOption(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
