/**
 * Minimal in-memory stand-in for the Mongoose query surface used by the search code paths.
 * Supports the subset of operators the services rely on ($in, $nin, $regex, $gt, $gte, $lt,
 * $lte, $or, $and, $elemMatch, equality) plus chainable find().sort().limit().select().lean()
 * and cursor().
 */
export interface FakeModel {
  docs: any[]
  find(query: any): any
  findOne(query: any): any
  findById(id: any): any
  findOneAndUpdate(query: any, update: any): any
  deleteMany(query: any): Promise<void>
  create(doc: any): Promise<any>
}

function get(doc: any, path: string) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), doc)
}

function eq(a: any, b: any) {
  if (a instanceof Date || b instanceof Date) return new Date(a).getTime() === new Date(b).getTime()
  if (a != null && b != null && typeof a === 'object' && typeof b === 'object') return String(a) === String(b)
  return String(a) === String(b) || a === b
}

function matchesCondition(value: any, condition: any): boolean {
  if (condition instanceof RegExp) return condition.test(String(value ?? ''))
  if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
    const keys = Object.keys(condition)
    if (keys.some(key => key.startsWith('$'))) {
      return keys.every(key => {
        const expected = condition[key]
        switch (key) {
          case '$in':
            return Array.isArray(value)
              ? value.some(item => expected.some((candidate: any) => eq(item, candidate)))
              : expected.some((candidate: any) => eq(value, candidate))
          case '$nin':
            return !expected.some((candidate: any) => eq(value, candidate))
          case '$regex': {
            // MongoDB's PCRE understands \p{..} classes natively; emulate that with the `u` flag.
            const regex = expected instanceof RegExp ? expected : new RegExp(expected, `${condition.$options ?? ''}u`)
            return regex.test(String(value ?? ''))
          }
          case '$options':
            return true
          case '$gt':
            return value != null && new Date(value).getTime() > new Date(expected).getTime()
          case '$gte':
            return value != null && new Date(value).getTime() >= new Date(expected).getTime()
          case '$lt':
            return value != null && new Date(value).getTime() < new Date(expected).getTime()
          case '$lte':
            return value != null && new Date(value).getTime() <= new Date(expected).getTime()
          case '$exists':
            return expected ? value !== undefined : value === undefined
          case '$elemMatch':
            return Array.isArray(value) && value.some(item => matchesQuery(item, expected))
          default:
            throw new Error(`fake-models: unsupported operator ${key}`)
        }
      })
    }
  }
  if (Array.isArray(value) && !Array.isArray(condition)) return value.some(item => eq(item, condition))
  if (condition === null) return value == null
  return eq(value, condition)
}

export function matchesQuery(doc: any, query: any): boolean {
  return Object.entries(query ?? {}).every(([key, condition]) => {
    if (key === '$or') return (condition as any[]).some(sub => matchesQuery(doc, sub))
    if (key === '$and') return (condition as any[]).every(sub => matchesQuery(doc, sub))
    return matchesCondition(get(doc, key), condition)
  })
}

function sortDocs(docs: any[], sort?: Record<string, number>) {
  if (!sort) return docs
  const entries = Object.entries(sort)
  return [...docs].sort((a, b) => {
    for (const [key, direction] of entries) {
      const av = get(a, key)
      const bv = get(b, key)
      if (av === bv) continue
      if (av == null) return 1
      if (bv == null) return -1
      const comparison = av instanceof Date || bv instanceof Date
        ? new Date(av).getTime() - new Date(bv).getTime()
        : String(av).localeCompare(String(bv))
      if (comparison !== 0) return comparison * direction
    }
    return 0
  })
}

function clone<T>(value: T): T {
  return value == null ? value : structuredClone(value)
}

export function createFakeModel(initial: any[] = []): FakeModel {
  const docs = initial.map(doc => ({ ...doc }))
  const model: FakeModel = {
    docs,
    find(query: any) {
      let sort: Record<string, number> | undefined
      let limit: number | undefined
      const run = () => {
        let matched = docs.filter(doc => matchesQuery(doc, query))
        matched = sortDocs(matched, sort)
        if (limit != null) matched = matched.slice(0, limit)
        return matched.map(clone)
      }
      const chain: any = {
        sort(value: Record<string, number>) {
          sort = value
          return chain
        },
        limit(value: number) {
          limit = value
          return chain
        },
        select() {
          return chain
        },
        lean() {
          const promise: any = Promise.resolve().then(run)
          promise.cursor = () => ({
            async *[Symbol.asyncIterator]() {
              for (const doc of run()) yield doc
            },
            async close() {},
          })
          promise.select = () => promise
          promise.sort = () => promise
          return promise
        },
        then(resolve: any, reject: any) {
          return Promise.resolve().then(run).then(resolve, reject)
        },
      }
      return chain
    },
    findOne(query: any) {
      const run = () => clone(docs.find(doc => matchesQuery(doc, query)) ?? null)
      const chain: any = {
        select: () => chain,
        lean: () => Promise.resolve().then(run),
        then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
      }
      return chain
    },
    findById(id: any) {
      return model.findOne({ _id: id })
    },
    findOneAndUpdate(query: any, update: any) {
      const run = () => {
        const doc = docs.find(candidate => matchesQuery(candidate, query))
        if (!doc) return null
        Object.assign(doc, update.$set ?? {})
        for (const key of Object.keys(update.$unset ?? {})) delete doc[key]
        return clone(doc)
      }
      return { lean: () => Promise.resolve().then(run) }
    },
    async deleteMany(query: any) {
      for (let index = docs.length - 1; index >= 0; index -= 1) {
        if (matchesQuery(docs[index], query)) docs.splice(index, 1)
      }
    },
    async create(doc: any) {
      const created = { _id: doc._id ?? `id-${docs.length + 1}`, ...doc }
      docs.push(created)
      return clone(created)
    },
  }
  return model
}
