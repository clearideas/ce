import { expect, test } from '@playwright/test'
import http from 'node:http'
import path from 'node:path'
import { createTestCeRuntime, type TestCeRuntime } from '../harness/runtime.js'

let ctx: TestCeRuntime
let server: http.Server
let baseURL: string

test.beforeAll(async () => {
  const webRoot = path.resolve(import.meta.dirname, '../../web')
  ctx = await createTestCeRuntime({ webRoot })
  server = ctx.runtime.app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not resolve CE smoke server port')
  baseURL = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await ctx.close()
})

test('critical CE browser smoke flow', async ({ page }) => {
  await signIn(page, 'smoke@clearideas.local')
  await page.goto(`${baseURL}/sites`)
  await expect(page).toHaveTitle(/Clear Ideas/i)
  await expect(page.getByText('Community Edition').first()).toBeVisible()

  const site = await api(page, '/api/sites', { method: 'POST', body: { name: 'Smoke Site' } })
  const siteId = site.site.id as string
  await api(page, `/api/sites/${siteId}`, { method: 'PATCH', body: { attributes: { ai: { chatEnabled: true, mcpEnabled: true }, mcp: { enabled: true } } } })
  const folder = await api(page, `/api/sites/${siteId}/folders`, { method: 'POST', body: { name: 'Root Folder' } })
  const child = await api(page, `/api/sites/${siteId}/folders`, { method: 'POST', body: { name: 'Nested Folder', folderId: folder.folder.id } })
  expect(child.folder.parentId).toBe(folder.folder.id)

  const target = await api(page, '/api/files/upload-target', {
    method: 'POST',
    body: { siteId, folderId: child.folder.id, fileName: 'smoke.json', contentType: 'application/json', size: 17 },
  })
  await page.request.put(`${baseURL}${target.target.url}`, {
    data: Buffer.from('{"hello":"world"}'),
    headers: { 'content-type': 'application/json', ...(target.target.headers ?? {}) },
  })
  await expect.poll(async () => {
    const result = await api(page, `/api/site/${siteId}/search`, { method: 'POST', body: { q: '@contentType:application/json' } })
    return result.results.length
  }).toBeGreaterThan(0)

  await page.goto(`${baseURL}/site/${siteId}/content`)
  await expect(page.getByText('Smoke Site').first()).toBeVisible()
  await page.goto(`${baseURL}/site/${siteId}/users`)
  await expect(page.getByText('Users').first()).toBeVisible()
  await page.goto(`${baseURL}/site/${siteId}/settings`)
  await expect(page.getByText('Settings').first()).toBeVisible()

  const accessKey = await api(page, '/api/account/access-keys', {
    method: 'POST',
    body: { name: 'Smoke MCP', keyType: 'mcp', scopes: ['mcp:read', 'mcp:write'] },
  })
  const mcp = await page.request.post(`${baseURL}/api/mcp`, {
    headers: { authorization: `Bearer ${accessKey.key}` },
    data: { tool: 'clearideas.list_sites', args: {} },
  })
  expect(mcp.ok()).toBe(true)
  expect((await mcp.json()).result.sites.some((entry: any) => entry.id === siteId)).toBe(true)

  await page.goto(`${baseURL}/site/${siteId}/ai`)
  await expect(page.getByText('SITE AI').first()).toBeVisible()
  await page.goto(`${baseURL}/docs`)
  await expect(page.getByRole('heading', { name: 'Getting Started' })).toBeVisible()
})

async function signIn(page: any, email: string) {
  await page.request.post(`${baseURL}/api/auth/code/send`, { data: { email } })
  const code = ctx.email.lastCode(email)
  if (!code) throw new Error(`No sign-in code captured for ${email}`)
  const response = await page.request.post(`${baseURL}/api/auth/code/verify`, { data: { email, code, name: 'Smoke User' } })
  expect(response.ok()).toBe(true)
}

async function api(page: any, route: string, input: { method?: string; body?: unknown } = {}) {
  const response = await page.request.fetch(`${baseURL}${route}`, {
    method: input.method ?? 'GET',
    data: input.body,
    headers: input.body ? { 'content-type': 'application/json' } : undefined,
  })
  expect(response.ok()).toBe(true)
  return response.json()
}
