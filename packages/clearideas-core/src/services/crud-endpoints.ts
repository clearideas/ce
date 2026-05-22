import { NotFoundError } from '../errors/index.js'

export async function listResponse<T>(input: { load: () => Promise<T[]> }): Promise<T[]> {
  return input.load()
}

export async function getResponse<T>(input: { load: () => Promise<T | null | undefined> }): Promise<T> {
  const value = await input.load()
  if (value == null) throw new NotFoundError('Resource not found')
  return value
}

export async function createResponse<T>(input: { create: () => Promise<T> }): Promise<T> {
  return input.create()
}

export async function updateResponse<T>(input: {
  load: () => Promise<T | null | undefined>
  update: (current: T) => Promise<T>
}): Promise<T> {
  const current = await input.load()
  if (current == null) throw new NotFoundError('Resource not found')
  return input.update(current)
}

export async function deleteResponse<T>(input: {
  load: () => Promise<T | null | undefined>
  remove: (current: T) => Promise<void>
}): Promise<{ ok: true }> {
  const current = await input.load()
  if (current == null) throw new NotFoundError('Resource not found')
  await input.remove(current)
  return { ok: true }
}

