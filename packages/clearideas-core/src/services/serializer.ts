export type SerializedObject = Record<string, any>

export type SerializerOptions = {
  includeId?: boolean
  omitFields?: readonly string[]
}

export type SerializerExtension<TEntity, TContext, TSerialized extends SerializedObject> = (
  context: TContext & {
    entity: TEntity
    serialized: TSerialized
  }
) => Record<string, unknown>

export function extendSerialized<
  TEntity,
  TContext,
  TSerialized extends SerializedObject,
>(
  entity: TEntity,
  serialized: TSerialized,
  context: TContext,
  extend?: SerializerExtension<TEntity, TContext, TSerialized>,
): TSerialized {
  if (!extend) return serialized
  return {
    ...serialized,
    ...extend({ ...context, entity, serialized }),
  }
}

export function applySerializerOptions<TSerialized extends SerializedObject>(
  serialized: TSerialized,
  options: SerializerOptions = {},
): TSerialized {
  const next: SerializedObject = { ...serialized }
  if (options.includeId === false) delete next.id
  for (const field of options.omitFields ?? []) {
    delete next[field]
  }
  return next as TSerialized
}

export function serializeId(value: unknown): string {
  return value == null ? '' : String(value)
}

export function serializeDate(value: unknown): unknown {
  return value && typeof (value as any).toISOString === 'function'
    ? (value as any).toISOString()
    : value
}
