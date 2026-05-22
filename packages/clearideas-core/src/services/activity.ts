export interface ActivityCreateInput {
  user?: unknown
  action: string
  target: unknown
  onModel: string
  parent?: unknown
  parentOnModel?: string
  attributes?: Record<string, unknown>
}

export interface ActivityCreateResult {
  message: 'Activity successfully created'
}

export function serializeActivity(activity: any, options: {
  includeId?: boolean
  stringifyIds?: boolean
  includeTimestamps?: boolean
} = {}) {
  const source = typeof activity?.toObject === 'function' ? activity.toObject() : activity
  const stringifyIds = options.stringifyIds === true
  const normalizeId = (value: any) => {
    if (value == null) return stringifyIds ? null : value
    return stringifyIds ? String(value) : value
  }
  return {
    ...(options.includeId === true ? { id: String(source._id ?? source.id ?? '') } : {}),
    user: normalizeId(source.user),
    action: source.action,
    target: normalizeId(source.target),
    onModel: source.onModel,
    parent: source.parent == null ? (stringifyIds ? null : source.parent) : normalizeId(source.parent),
    parentOnModel: source.parentOnModel,
    cache: source.cache,
    attributes: source.attributes ?? {},
    ...(options.includeTimestamps === true
      ? { createdAt: source.createdAt, updatedAt: source.updatedAt }
      : {}),
  }
}

export async function postActivityBase(input: {
  activity: ActivityCreateInput
  writeActivity: (activity: ActivityCreateInput) => Promise<void> | void
}): Promise<ActivityCreateResult> {
  const attributes =
    input.activity.attributes != null &&
    typeof input.activity.attributes === 'object' &&
    !Array.isArray(input.activity.attributes)
      ? input.activity.attributes
      : {}

  await input.writeActivity({
    user: input.activity.user,
    action: input.activity.action,
    target: input.activity.target,
    onModel: input.activity.onModel,
    parent: input.activity.parent,
    parentOnModel: input.activity.parentOnModel,
    attributes,
  })

  return { message: 'Activity successfully created' }
}

export type ActivityWriter = (activity: ActivityCreateInput) => Promise<void> | void

export function createActivityLogger(writeActivity: ActivityWriter) {
  return {
    async log(activity: ActivityCreateInput): Promise<void> {
      await postActivityBase({ activity, writeActivity })
    },

    async safe(activity: ActivityCreateInput): Promise<void> {
      await postActivityBase({ activity, writeActivity }).catch(() => undefined)
    },
  }
}
