import { afterEach, describe, expect, it, vi } from 'vitest'
import { FetchPrivateError, fetchPrivate, setUnauthorizedHandler } from '../../src-web/src/api/fetchPrivate'

describe('fetchPrivate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setUnauthorizedHandler(null)
  })

  it('keeps API paths centralized and sends credentials', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPrivate('/api/sites')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/sites', expect.objectContaining({ credentials: 'include' }))
  })

  it('retries a 401 once when Better Auth still has a refreshable session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 'session' }, user: { id: 'user' } }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: true }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPrivate('/api/sites')).resolves.toEqual({ data: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws the server error body without masking messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Nope' }), { status: 400, headers: { 'content-type': 'application/json' } })))
    await expect(fetchPrivate('/api/sites')).rejects.toMatchObject(new FetchPrivateError('Nope', 400, { error: 'Nope' }))
  })
})
