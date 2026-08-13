import { expect, test } from '@playwright/test'
import http from 'node:http'
import path from 'node:path'
import type { ModelAdapter, ModelRequest, ModelResult } from '@clearideas/agent-runtime'
import { createTestCeRuntime, type TestCeRuntime } from '../harness/runtime.js'

let ctx: TestCeRuntime
let server: http.Server
let baseURL: string

class FakeModelAdapter implements ModelAdapter {
  async generate(_request: ModelRequest): Promise<ModelResult> {
    return {
      output: 'A concise browser-tested agent answer.',
      transcript: [
        {
          id: 'fake-e2e-message',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'A concise browser-tested agent answer.' }],
          createdAt: new Date().toISOString(),
          model: 'test/fake',
        },
      ],
      finishReason: 'stop',
    }
  }
}

test.beforeAll(async () => {
  const webRoot = path.resolve(import.meta.dirname, '../../web')
  ctx = await createTestCeRuntime({ webRoot, agentModelAdapter: new FakeModelAdapter() })
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

test('creates, runs, inspects, and schedules an agent in the UI', async ({ page }) => {
  await signIn(page, 'smoke@clearideas.local')
  await page.goto(`${baseURL}/agents`)
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()

  const manifest = {
    schemaVersion: '1.0',
    name: 'Browser test agent',
    description: 'Exercises the CE agent UI.',
    model: { ref: 'default' },
    variables: [
      { key: 'question', type: 'string', requiresOverride: true, description: 'Question to answer.' },
    ],
    steps: [
      { id: 'answer', type: 'prompt', prompt: '{{ question }}', includeInFinalOutput: true },
    ],
  }
  await page.getByLabel('Agent manifest (JSON)').fill(JSON.stringify(manifest, null, 2))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Browser test agent', { exact: true }).first()).toBeVisible()

  await page.getByLabel('question').fill('What is covered?')
  await page.getByRole('button', { name: 'Run agent' }).click()
  await expect(page.getByText('A concise browser-tested agent answer.').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'completed' })).toBeVisible()

  await page.getByRole('button', { name: 'View' }).click()
  await expect(page.getByText('Run details')).toBeVisible()
  await expect(page.getByText('A concise browser-tested agent answer.').last()).toBeVisible()
  await page.getByRole('button', { name: 'Close run details' }).click()

  await page.getByRole('button', { name: 'Create schedule' }).click()
  await expect(page.getByText('daily', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Next:/)).toBeVisible()
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
