/**
 * Minimal in-process task queue with bounded concurrency.
 *
 * Used to keep CPU/IO heavy background work (search indexing, PDF text extraction)
 * off the request path and to prevent unbounded parallelism when many uploads arrive
 * at once.
 */
export interface TaskQueue {
  /** Schedules `task` and resolves with its result once it has run. */
  run<T>(task: () => Promise<T>): Promise<T>
  /** Number of tasks waiting or running. */
  readonly size: number
  /** Resolves once every task scheduled so far has settled. */
  idle(): Promise<void>
}

export function createTaskQueue(options: { concurrency: number }): TaskQueue {
  const concurrency = Math.max(1, Math.floor(options.concurrency))
  const pending: Array<() => void> = []
  let active = 0
  let idleResolvers: Array<() => void> = []

  const next = () => {
    if (active === 0 && pending.length === 0) {
      const resolvers = idleResolvers
      idleResolvers = []
      for (const resolve of resolvers) resolve()
      return
    }
    while (active < concurrency && pending.length > 0) {
      const start = pending.shift()!
      start()
    }
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push(() => {
          active += 1
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              active -= 1
              next()
            })
        })
        next()
      })
    },
    get size() {
      return active + pending.length
    },
    idle() {
      if (active === 0 && pending.length === 0) return Promise.resolve()
      return new Promise<void>(resolve => {
        idleResolvers.push(resolve)
      })
    },
  }
}
