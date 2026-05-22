import { afterEach, describe, expect, it, vi } from 'vitest'
import { ceApi } from '../../src-web/src/api/client'

function mockUpdateSiteFetch() {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    return new Response(JSON.stringify({
      site: {
        id: 'site-1',
        name: 'CE Site',
        ...body,
      },
    }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('CE site settings request contracts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['general', { name: 'CE Site', visibility: 'private' }],
    ['notifications', { attributes: { notifications: true } }],
    ['ai', { attributes: { ai: { chatEnabled: true, mcpEnabled: true } } }],
    ['mcp compatibility', { attributes: { mcp: { enabled: true } } }],
    ['pdf options', { attributes: { pdf: { printEnabled: true, printRoles: ['admin', 'viewer'] } } }],
    ['media', { attributes: { media: { icon: { dataUrl: 'data:image/png;base64,abc' } } } }],
    ['media clear', { attributes: { media: { icon: null } } }],
  ])('validates and sends the %s settings payload', async (_label, payload) => {
    const fetchMock = mockUpdateSiteFetch()

    await expect(ceApi.updateSite('site-1', payload)).resolves.toMatchObject({
      site: {
        id: 'site-1',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/sites/site-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify(payload),
    }))
  })

  it('rejects decorated site attributes locally before fetch', async () => {
    const fetchMock = mockUpdateSiteFetch()

    expect(() => ceApi.updateSite('site-1', {
      attributes: {
        notifications: true,
        latestUpdatedAt: '2026-05-20T12:00:00.000Z',
      },
    })).toThrow('Update site payload is invalid')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
