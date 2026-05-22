import { createHash, randomBytes } from 'node:crypto'
import { BadRequestError, NotFoundError } from '../errors/index.js'
import {
  applySerializerOptions,
  extendSerialized,
  serializeId as defaultSerializeId,
  type SerializerExtension,
  type SerializerOptions,
} from './serializer.js'

export type AccessKeyType = string
export type AccessKeyScope = string
export type AccessKeyScopeRegistry = Record<string, readonly string[]>

export const CORE_ACCESS_KEY_SCOPE_REGISTRY: AccessKeyScopeRegistry = {
  mcp: ['mcp:read', 'mcp:write'],
}

export function getActiveScopesByType(
  registry: AccessKeyScopeRegistry = CORE_ACCESS_KEY_SCOPE_REGISTRY,
): AccessKeyScopeRegistry {
  return registry
}

export function getInvalidScopesByType(input: {
  keyType: AccessKeyType
  scopes: string[]
  validScopesByType?: AccessKeyScopeRegistry
}): string[] {
  const validScopes = (input.validScopesByType ?? CORE_ACCESS_KEY_SCOPE_REGISTRY)[input.keyType] ?? []
  return input.scopes.filter(scope => !validScopes.includes(scope))
}

export function generateAccessKeyPair(input: { keyType: AccessKeyType }): {
  key: string
  keyId: string
  prefix: string
} {
  const keyId = randomBytes(8).toString('hex')
  const secret = randomBytes(32).toString('hex')
  const key = `${input.keyType}_${keyId}.${secret}`
  const prefix = `${input.keyType}_${keyId.substring(0, 8)}...`
  return { key, keyId, prefix }
}

export function hashAccessKeyValue(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export type CoreAccessKeyModels = {
  AccessKeyModel: any
  SiteModel?: any
}

export type CoreAccessKeyServiceOptions = {
  validScopesByType?: AccessKeyScopeRegistry
  serialization?: SerializeAccessKeyOptions
}

export type SerializedAccessKey = Record<string, any>

export type AccessKeySerializationContext = {
  accessKey: any
  source: any
}

export type SerializeAccessKeyOptions = SerializerOptions & {
  serializeId?: (value: unknown) => unknown
  extendMetadata?: (context: AccessKeySerializationContext) => Record<string, unknown>
  extendAccessKey?: SerializerExtension<any, AccessKeySerializationContext, SerializedAccessKey>
}

export function serializeAccessKey(accessKey: any, options: SerializeAccessKeyOptions = {}) {
  const source = typeof accessKey?.toObject === 'function' ? accessKey.toObject() : accessKey
  const serializeId = options.serializeId ?? defaultSerializeId
  const context = { accessKey, source }
  const serialized: SerializedAccessKey = {
    id: serializeId(source._id ?? source.id ?? ''),
    accountId: source.accountId,
    name: source.name,
    description: source.description,
    prefix: source.prefix,
    keyId: source.keyId,
    keyType: source.keyType,
    scopes: source.scopes,
    siteId: source.siteId ? String(source.siteId) : undefined,
    lastUsedAt: source.lastUsedAt ?? null,
    expiresAt: source.expiresAt ?? null,
    isActive: source.isActive,
    metadata: {
      ...(source.metadata ?? {}),
      ...(options.extendMetadata?.(context) ?? {}),
    },
    updatedAt: source.updatedAt,
    createdAt: source.createdAt,
    keyHash: '',
  }
  return applySerializerOptions(extendSerialized(accessKey, serialized, context, options.extendAccessKey), options)
}

export function createCoreAccessKeyService(
  models: CoreAccessKeyModels,
  options: CoreAccessKeyServiceOptions = {},
) {
  return {
    async listForAccount(accountId: unknown) {
      const accessKeys = typeof models.AccessKeyModel.findByAccountId === 'function'
        ? await models.AccessKeyModel.findByAccountId(accountId)
        : await models.AccessKeyModel.find({ accountId }).sort({ createdAt: -1 }).lean()
      return accessKeys.map((key: any) => serializeAccessKey(key, options.serialization))
    },

    async create(input: {
      accountId: unknown
      name: string
      description?: string
      keyType: AccessKeyType
      scopes: string[]
      expiresIn?: number
      siteId?: string
      metadata?: Record<string, unknown>
      hashAccessKey?: (key: string) => Promise<string> | string
      generateAccessKey?: (keyType: AccessKeyType) => { key: string; keyId: string; prefix: string }
      toObjectId?: (id: string) => unknown
    }) {
      validateCreateAccessKeyInput(input, options)

      const generated = input.generateAccessKey?.(input.keyType) ?? generateAccessKeyPair({ keyType: input.keyType })
      const keyHash = await (input.hashAccessKey?.(generated.key) ?? hashAccessKeyValue(generated.key))
      const expiresAt = input.expiresIn != null && input.expiresIn > 0
        ? new Date(Date.now() + input.expiresIn)
        : undefined
      const payload = {
        accountId: input.accountId,
        name: input.name.trim(),
        description: input.description?.trim(),
        keyHash,
        prefix: generated.prefix,
        keyId: generated.keyId,
        keyType: input.keyType,
        scopes: input.scopes,
        expiresAt,
        isActive: true,
        metadata: input.metadata ?? {},
        ...(input.siteId ? { siteId: input.toObjectId?.(input.siteId) ?? input.siteId } : {}),
      }
      const accessKey = typeof models.AccessKeyModel.createWithIAccessKey === 'function'
        ? await models.AccessKeyModel.createWithIAccessKey(payload)
        : await models.AccessKeyModel.create(payload)
      return {
        key: generated.key,
        accessKey,
        publicAccessKey: serializeAccessKey(accessKey, options.serialization),
      }
    },

    async update(input: {
      accountId: unknown
      keyId: string
      name?: string
      description?: string
      scopes?: string[]
      expiresAt?: string | Date | null
      toObjectId?: (id: string) => unknown
    }) {
      const accessKey = await findAccessKeyForAccount(models.AccessKeyModel, input)
      const previousValues = {
        name: accessKey.name,
        description: accessKey.description,
        scopes: accessKey.scopes,
        expiresAt: accessKey.expiresAt,
      }
      const updates = buildAccessKeyUpdate(accessKey, input, options)
      const updatedAccessKey = typeof models.AccessKeyModel.updateWithPublicAccessKeyUpdatable === 'function'
        ? await models.AccessKeyModel.updateWithPublicAccessKeyUpdatable(accessKey._id, updates)
        : await updateAccessKeyDocument(accessKey, updates)
      if (!updatedAccessKey) throw new NotFoundError('Access key not found')
      return {
        accessKey,
        updatedAccessKey,
        publicAccessKey: serializeAccessKey(updatedAccessKey, options.serialization),
        previousValues,
        updates,
      }
    },

    async revoke(input: {
      accountId: unknown
      keyId: string
      toObjectId?: (id: string) => unknown
    }) {
      const accessKey = await findAccessKeyForAccount(models.AccessKeyModel, input)
      const keyDetails = {
        accessKeyId: accessKey._id?.toString(),
        keyId: accessKey.keyId,
        name: accessKey.name,
        keyType: accessKey.keyType,
        scopes: accessKey.scopes,
        expiresAt: accessKey.expiresAt,
        wasActive: accessKey.isActive,
      }
      const updatedAccessKey = typeof models.AccessKeyModel.updateWithPublicAccessKeyUpdatable === 'function'
        ? await models.AccessKeyModel.updateWithPublicAccessKeyUpdatable(accessKey._id, { isActive: false })
        : await updateAccessKeyDocument(accessKey, { isActive: false })
      return {
        accessKey,
        updatedAccessKey,
        publicAccessKey: updatedAccessKey ? serializeAccessKey(updatedAccessKey, options.serialization) : null,
        keyDetails,
      }
    },
  }
}

function validateCreateAccessKeyInput(input: {
  name?: unknown
  keyType?: unknown
  scopes?: unknown
}, options: CoreAccessKeyServiceOptions) {
  const scopeRegistry = options.validScopesByType ?? CORE_ACCESS_KEY_SCOPE_REGISTRY
  const validKeyTypes = Object.keys(scopeRegistry)
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new BadRequestError('Name is required')
  }
  if (!input.keyType || typeof input.keyType !== 'string' || !validKeyTypes.includes(input.keyType)) {
    throw new BadRequestError(`Invalid keyType. Must be one of: ${validKeyTypes.join(', ')}`)
  }
  if (!input.scopes || !Array.isArray(input.scopes) || input.scopes.length === 0) {
    throw new BadRequestError('At least one scope is required')
  }
  const invalidScopes = getInvalidScopesByType({
    keyType: input.keyType as AccessKeyType,
    scopes: input.scopes as string[],
    validScopesByType: scopeRegistry,
  })
  if (invalidScopes.length > 0) {
    throw new BadRequestError(`Invalid scopes for ${input.keyType} key type: ${invalidScopes.join(', ')}`)
  }
}

async function findAccessKeyForAccount(AccessKeyModel: any, input: {
  accountId: unknown
  keyId: string
  toObjectId?: (id: string) => unknown
}) {
  const accessKey = await AccessKeyModel.findOne({
    _id: input.toObjectId?.(input.keyId) ?? input.keyId,
    accountId: input.accountId,
  })
  if (!accessKey) throw new NotFoundError('Access key not found')
  return accessKey
}

function buildAccessKeyUpdate(accessKey: any, input: {
  name?: string
  description?: string
  scopes?: string[]
  expiresAt?: string | Date | null
}, options: CoreAccessKeyServiceOptions) {
  if (input.scopes && Array.isArray(input.scopes) && input.scopes.length > 0) {
    const invalidScopes = getInvalidScopesByType({
      keyType: accessKey.keyType as AccessKeyType,
      scopes: input.scopes,
      validScopesByType: options.validScopesByType,
    })
    if (invalidScopes.length > 0) {
      throw new BadRequestError(`Invalid scopes for ${accessKey.keyType} key type: ${invalidScopes.join(', ')}`)
    }
  }
  const updates: Record<string, unknown> = {}
  if (input.name && typeof input.name === 'string') updates.name = input.name.trim()
  if (input.description !== undefined) updates.description = input.description?.trim()
  if (input.scopes && Array.isArray(input.scopes) && input.scopes.length > 0) updates.scopes = input.scopes
  if (input.expiresAt !== undefined) updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  return updates
}

async function updateAccessKeyDocument(accessKey: any, updates: Record<string, unknown>) {
  Object.assign(accessKey, updates)
  await accessKey.save()
  return accessKey
}
