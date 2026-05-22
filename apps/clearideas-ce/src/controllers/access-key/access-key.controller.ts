import {
  createCoreAccessKeyService,
  getActiveScopesByType,
  type AccessKeyType,
} from '@clearideas/core'
import type { Request, Response } from 'express'
import type { CeAppContext } from '../../lib/app-context.js'

export class AccessKeyController {
  private readonly accessKeyService

  constructor(ctx: CeAppContext) {
    this.accessKeyService = createCoreAccessKeyService({
      AccessKeyModel: ctx.models.AccessKeyModel,
      SiteModel: ctx.models.SiteModel,
    })
  }

  list = async (req: Request, res: Response) => {
    const accessKeys = await this.accessKeyService.listForAccount(req.accountId)
    res.json({
      accessKeys,
    })
  }

  types = async (_req: Request, res: Response) => {
    res.json({ keyTypes: getActiveScopesByType() })
  }

  create = async (req: Request, res: Response) => {
    const { name, description, keyType, scopes, expiresIn, siteId } = req.body as {
      name: string
      description?: string
      keyType: AccessKeyType
      scopes: string[]
      expiresIn?: number
      siteId?: string
    }
    const { key, publicAccessKey } = await this.accessKeyService.create({
      accountId: req.accountId,
      name,
      description,
      keyType,
      scopes,
      expiresIn,
      siteId,
    })

    res.status(201).json({
      message: 'Access key created successfully',
      key,
      accessKey: publicAccessKey,
    })
  }

  update = async (req: Request, res: Response) => {
    const { publicAccessKey } = await this.accessKeyService.update({
      accountId: req.accountId,
      keyId: String(req.params.keyId),
      ...req.body,
    })
    res.json({
      message: 'Access key updated successfully',
      accessKey: publicAccessKey,
    })
  }

  revoke = async (req: Request, res: Response) => {
    const { publicAccessKey } = await this.accessKeyService.revoke({
      accountId: req.accountId,
      keyId: String(req.params.keyId),
    })
    res.json({ message: 'Access key revoked successfully', accessKey: publicAccessKey })
  }
}
