import type { Request, Response } from 'express'
import { NotFoundError } from '@clearideas/core/errors'
import type { CeAppContext } from '../../lib/app-context.js'
import type { AgentHostMessage, AgentHostService } from '../../services/agent/agent-host.js'
import { manifestUsesSiteTools, validateCeAgentManifest } from '../../services/agent/manifest-policy.js'

export class AgentController {
  constructor(
    private readonly ctx: CeAppContext,
    private readonly agentHost: AgentHostService,
  ) {}

  list = async (req: Request, res: Response) => {
    const rows = await this.ctx.models.AgentModel.find({ accountId: req.accountId })
      .sort({ updatedAt: -1 })
      .lean()
    res.json({ agents: rows.map(serializeAgent), runtimeConfigured: this.agentHost.isConfigured() })
  }

  get = async (req: Request, res: Response) => {
    const row = await this.findAgent(req)
    res.json({ agent: serializeAgent(row), runtimeConfigured: this.agentHost.isConfigured() })
  }

  create = async (req: Request, res: Response) => {
    const manifest = validateCeAgentManifest(req.body.manifest)
    const row = await this.ctx.models.AgentModel.create({
      accountId: req.accountId,
      createdBy: req.sub,
      name: manifest.name,
      description: manifest.description ?? '',
      manifest,
      revision: 1,
    })
    res.status(201).json({ agent: serializeAgent(row.toObject()) })
  }

  update = async (req: Request, res: Response) => {
    const manifest = validateCeAgentManifest(req.body.manifest)
    const row = await this.ctx.models.AgentModel.findOneAndUpdate(
      { _id: req.params.agentId, accountId: req.accountId },
      {
        $set: {
          name: manifest.name,
          description: manifest.description ?? '',
          manifest,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after', lean: true },
    )
    if (!row) throw new NotFoundError('Agent not found.')
    if (manifestUsesSiteTools(manifest)) {
      await this.ctx.models.AgentScheduleModel.updateMany(
        { agentId: row._id, siteId: { $exists: false } },
        {
          $set: { enabled: false, lastError: 'A Site is required by the updated agent.' },
          $unset: { nextRunAt: 1 },
        },
      )
    }
    res.json({ agent: serializeAgent(row) })
  }

  remove = async (req: Request, res: Response) => {
    const row = await this.ctx.models.AgentModel.findOneAndDelete({
      _id: req.params.agentId,
      accountId: req.accountId,
    }).lean()
    if (!row) throw new NotFoundError('Agent not found.')
    const schedules = await this.ctx.models.AgentScheduleModel.find({ agentId: row._id })
      .select('_id')
      .lean()
    await Promise.all([
      this.ctx.models.AgentScheduleModel.deleteMany({ agentId: row._id }),
      this.ctx.models.AgentTaskModel.deleteMany({
        scheduleId: { $in: schedules.map((schedule: any) => schedule._id) },
        status: { $in: ['pending', 'claimed'] },
      }),
    ])
    res.status(204).end()
  }

  run = async (req: Request, res: Response) => {
    await this.stream(res, async (onMessage, signal) => {
      await this.agentHost.execute(
        {
          agentId: String(req.params.agentId),
          accountId: String(req.accountId),
          userId: String(req.sub),
          variables: req.body.variables,
          siteId: req.body.siteId,
          execution: req.body.execution,
        },
        onMessage,
        signal,
      )
    })
  }

  resume = async (req: Request, res: Response) => {
    await this.stream(res, async (onMessage, signal) => {
      await this.agentHost.resume(
        { runId: String(req.params.runId), accountId: String(req.accountId), userId: String(req.sub) },
        onMessage,
        signal,
      )
    })
  }

  listRuns = async (req: Request, res: Response) => {
    const filter: any = { accountId: req.accountId }
    if (req.query.agentId) filter.agentId = String(req.query.agentId)
    const rows = await this.ctx.models.AgentRunModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit ?? 25))
      .lean()
    res.json({ runs: rows.map(serializeRun) })
  }

  getRun = async (req: Request, res: Response) => {
    const row = await this.ctx.models.AgentRunModel.findOne({
      runId: req.params.runId,
      accountId: req.accountId,
    }).lean()
    if (!row) throw new NotFoundError('Agent run not found.')
    res.json({ run: serializeRun(row) })
  }

  private async findAgent(req: Request) {
    const row = await this.ctx.models.AgentModel.findOne({
      _id: req.params.agentId,
      accountId: req.accountId,
    }).lean()
    if (!row) throw new NotFoundError('Agent not found.')
    return row
  }

  private async stream(
    res: Response,
    execute: (
      onMessage: (message: AgentHostMessage) => Promise<void>,
      signal: AbortSignal,
    ) => Promise<void>,
  ) {
    res.status(200)
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-content-type-options', 'nosniff')
    res.flushHeaders()
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    try {
      await execute(async message => writeNdjson(res, message), controller.signal)
    } catch (error) {
      await writeNdjson(res, {
        kind: 'error',
        error: error instanceof Error ? error.message : 'Agent run failed.',
      })
    } finally {
      res.end()
    }
  }
}

function serializeAgent(row: any) {
  return {
    id: String(row._id),
    name: row.name,
    description: row.description ?? '',
    manifest: row.manifest,
    revision: row.revision,
    createdBy: String(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function serializeRun(row: any) {
  return {
    runId: row.runId,
    agentId: String(row.agentId),
    agentRevision: row.agentRevision,
    siteId: row.siteId ? String(row.siteId) : null,
    source: row.source,
    scheduleId: row.scheduleId ? String(row.scheduleId) : null,
    status: row.record?.status,
    output: row.record?.output,
    transcript: row.record?.transcript ?? row.latestCheckpoint?.transcript ?? [],
    usage: row.record?.usage,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function writeNdjson(res: Response, value: unknown) {
  if (res.writableEnded || res.destroyed) return
  if (!res.write(`${JSON.stringify(value)}\n`)) {
    await new Promise<void>(resolve => res.once('drain', resolve))
  }
}
