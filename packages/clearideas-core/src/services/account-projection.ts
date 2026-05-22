import {
  applySerializerOptions,
  extendSerialized,
  serializeId,
  type SerializerExtension,
  type SerializerOptions,
} from './serializer.js'

export type SerializedAccount = Record<string, any>

export type AccountSerializationContext = Record<string, never>

export type SerializeAccountOptions = SerializerOptions & {
  extendAttributes?: (account: any) => Record<string, unknown>
  extendAccount?: SerializerExtension<any, AccountSerializationContext, SerializedAccount>
}

export function serializeAccountAttributes(account: any, options: Pick<SerializeAccountOptions, 'extendAttributes'> = {}) {
  return {
    search: {
      fullTextSearchEnabled: false,
      ocrEnabled: false,
      ...(account.attributes?.search ?? {}),
    },
    ...(account.attributes ?? {}),
    ...(options.extendAttributes?.(account) ?? {}),
  }
}

export function serializeAccount(account: any, options: SerializeAccountOptions = {}) {
  const serialized: SerializedAccount = {
    id: serializeId(account._id ?? account.id),
    name: account.name,
    attributes: serializeAccountAttributes(account, options),
  }
  return applySerializerOptions(extendSerialized(account, serialized, {}, options.extendAccount), options)
}
