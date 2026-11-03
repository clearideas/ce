import { describe, expect, it } from 'vitest'
import { createTaskQueue } from '../../src/services/task-queue.js'

describe('task queue', () => {
  it('bounds concurrency, preserves results, and reports idleness', async () => {
    const queue = createTaskQueue({ concurrency: 2 })
    let running = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        queue.run(async () => {
          running += 1
          peak = Math.max(peak, running)
          await new Promise(resolve => setTimeout(resolve, 5))
          running -= 1
          return index
        }),
      ),
    )
    expect(results).toEqual([0, 1, 2, 3, 4, 5])
    expect(peak).toBe(2)
    await queue.idle()
    expect(queue.size).toBe(0)
  })

  it('propagates failures without blocking later tasks', async () => {
    const queue = createTaskQueue({ concurrency: 1 })
    const failing = queue.run(async () => {
      throw new Error('boom')
    })
    const next = queue.run(async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
    await queue.idle()
  })
})
