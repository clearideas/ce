import type { AgentScheduleDefinition } from '@clearideas/contracts-core'
import { manifestUsesSiteTools } from '../../services/agent/manifest-policy.js'
import { assertScheduleCanStart } from '../../services/agent/schedule.js'
import { BadRequestError, NotFoundError } from '@clearideas/core/errors'
import type { Request, Response } from 'express'
import type { CeAppContext } from '../../lib/app-context.js'
import { assertSiteReadAccess } from '../../middleware/access-control.js'

export class AgentScheduleController {
  constructor(private readonly ctx: CeAppContext) {}

  list = async (req: Request, res: Response) => {
    await this.assertAgent(req)
    const rows = await this.ctx.models.AgentScheduleModel.find({
      accountId: req.accountId,
      agentId: req.params.agentId,
    })
      .sort({ createdAt: -1 })
      .lean()
    res.json({ schedules: rows.map(serializeSchedule) })
  }

  create = async (req: Request, res: Response) => {
    const agent = await this.assertAgent(req)
    await this.assertSite(req, agent.manifest)
    const nextRunAt = req.body.enabled
      ? assertScheduleCanStart(req.body.definition as AgentScheduleDefinition)
      : undefined
    const row = await this.ctx.models.AgentScheduleModel.create({
      accountId: req.accountId,
      createdBy: req.sub,
      agentId: agent._id,
      definition: req.body.definition,
      variables: req.body.variables,
      siteId: req.body.siteId,
      enabled: req.body.enabled,
      nextRunAt,
    })
    res.status(201).json({ schedule: serializeSchedule(row.toObject()) })
  }

  update = async (req: Request, res: Response) => {
    const schedule = await this.ctx.models.AgentScheduleModel.findOne({
      _id: req.params.scheduleId,
      accountId: req.accountId,
    }).lean()
    if (!schedule) throw new NotFoundError('Agent schedule not found.')
    const agent = await this.ctx.models.AgentModel.findOne({
      _id: schedule.agentId,
      accountId: req.accountId,
    }).lean()
    if (!agent) throw new NotFoundError('Agent not found.')
    await this.assertSite(req, agent.manifest)
    const nextRunAt = req.body.enabled
      ? assertScheduleCanStart(req.body.definition as AgentScheduleDefinition)
      : undefined
    const update: any = {
      $set: {
        definition: req.body.definition,
        variables: req.body.variables,
        siteId: req.body.siteId,
        enabled: req.body.enabled,
      },
      $unset: { lastError: 1 },
    }
    if (nextRunAt) update.$set.nextRunAt = nextRunAt
    else update.$unset.nextRunAt = 1
    const row = await this.ctx.models.AgentScheduleModel.findOneAndUpdate(
      { _id: schedule._id, accountId: req.accountId },
      update,
      { returnDocument: 'after', lean: true },
    )
    res.json({ schedule: serializeSchedule(row) })
  }

  remove = async (req: Request, res: Response) => {
    const row = await this.ctx.models.AgentScheduleModel.findOneAndDelete({
      _id: req.params.scheduleId,
      accountId: req.accountId,
    }).lean()
    if (!row) throw new NotFoundError('Agent schedule not found.')
    await this.ctx.models.AgentTaskModel.deleteMany({
      scheduleId: row._id,
      status: { $in: ['pending', 'claimed'] },
    })
    res.status(204).end()
  }

  private async assertAgent(req: Request) {
    const agent = await this.ctx.models.AgentModel.findOne({
      _id: req.params.agentId,
      accountId: req.accountId,
    }).lean()
    if (!agent) throw new NotFoundError('Agent not found.')
    return agent
  }

  private async assertSite(req: Request, manifest: any) {
    if (manifestUsesSiteTools(manifest) && !req.body.siteId) {
      throw new BadRequestError('A Site is required when an agent uses Site tools.')
    }
    if (req.body.siteId) {
      await assertSiteReadAccess({
        models: this.ctx.models,
        accountId: String(req.accountId),
        userId: String(req.sub),
        siteId: String(req.body.siteId),
      })
    }
  }
}

function serializeSchedule(row: any) {
  return {
    id: String(row._id),
    agentId: String(row.agentId),
    definition: row.definition,
    variables: row.variables ?? [],
    siteId: row.siteId ? String(row.siteId) : null,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt ?? null,
    lastRunAt: row.lastRunAt ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
