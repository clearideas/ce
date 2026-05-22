import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SuperTest, Test } from 'supertest'
import supertest from 'supertest'
import { createDefaultUserAttributes } from '@clearideas/core'
import { processPendingNotifications } from '../../src/workers/notification-worker.js'
import { createTestCeRuntime, signIn, type TestCeRuntime } from '../harness/runtime.js'
import { SiteChatController } from '../../src/controllers/chat/site-chat.controller.js'

describe('Clear Ideas CE API integration', () => {
  let ctx: TestCeRuntime
  let agent: SuperTest<Test>
  let user: { id: string; email: string; name: string }

  beforeAll(async () => {
    ctx = await createTestCeRuntime()
    agent = ctx.agent
    user = await signIn({ agent, email: ctx.email, address: 'owner@clearideas.local', name: 'Owner User' })
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('serves health, protects API 404s from SPA fallback, and serves frontend routes', async () => {
    await agent.get('/api/health').expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ status: 'ok', app: 'clearideas-ce', db: 'connected' })
    })
    await agent.get('/api/app-config').expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ docsEnabled: true })
    })
    await agent.get('/api/not-a-route').expect(404).expect(({ body }) => {
      expect(body.error).toMatch(/not found/i)
    })
    await agent.get('/sites').expect(200).expect('content-type', /html/)
  })

  it('supports auth code sessions and account/profile settings', async () => {
    await agent.get('/api/auth/session').expect(200).expect(({ body }) => {
      expect(body.user.email).toBe('owner@clearideas.local')
    })
    await agent.patch('/api/profile').send({ attributes: { timezone: 'America/Toronto', sites: { autoAcceptInvites: true } } }).expect(200)
    await agent.get('/api/profile').expect(200).expect(({ body }) => {
      expect(body.profile.attributes.timezone).toBe('America/Toronto')
      expect(body.profile.attributes.sites.autoAcceptInvites).toBe(true)
    })
  })

  it('creates sites, nested folders, files, search records, activities, notifications, and MCP read/write access', async () => {
    const site = await createSite('CE API Site')
    await agent.patch(`/api/sites/${site.id}`).send({ attributes: { ai: { chatEnabled: true, mcpEnabled: true }, mcp: { enabled: true } } }).expect(200).expect(({ body }) => {
      expect(body.site.attributes.ai).toMatchObject({ chatEnabled: true, mcpEnabled: true })
    })
    await agent.patch(`/api/sites/${site.id}`).send({ attributes: null }).expect(400).expect(({ body }) => {
      expect(body.error).toMatch(/attributes/i)
    })

    const folder = await agent.post(`/api/sites/${site.id}/folders`).send({ name: 'Financials' }).expect(201).then(res => res.body.folder)
    const childFolder = await agent.post(`/api/sites/${site.id}/folders`).send({ name: 'Quarterly', folderId: folder.id }).expect(201).then(res => res.body.folder)
    expect(childFolder.parentId).toBe(folder.id)

    const jsonFile = await uploadFile({ siteId: site.id, folderId: childFolder.id, fileName: 'topics.json', contentType: 'application/json', body: Buffer.from('{"topic":"GMV","value":"$235.9B"}') })
    const mdFile = await uploadFile({ siteId: site.id, folderId: childFolder.id, fileName: 'notes.md', contentType: 'text/markdown', body: Buffer.from('# Notes\n\nShopify GMV grew strongly.') })
    const pdfFile = await uploadFile({ siteId: site.id, fileName: 'sample-report.pdf', contentType: 'application/pdf', body: testPdfBuffer() })
    await agent.get('/api/sites').expect(200).expect(({ body }) => {
      const listedSite = body.sites.find((entry: any) => entry.id === site.id)
      expect(listedSite).toBeTruthy()
      expect(listedSite.files ?? []).toHaveLength(0)
      expect(listedSite.folders ?? []).toHaveLength(0)
    })
    await agent.get(`/api/sites/${site.id}`).expect(200).expect(({ body }) => {
      expect(body.site.files).toEqual(expect.arrayContaining([expect.objectContaining({ id: pdfFile.id })]))
      expect(body.site.folders).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: folder.id,
          files: expect.any(Array),
        }),
        expect.objectContaining({
          id: childFolder.id,
          parentId: folder.id,
          files: expect.arrayContaining([
            expect.objectContaining({ id: jsonFile.id }),
            expect.objectContaining({ id: mdFile.id }),
          ]),
        }),
      ]))
    })
    const siteDoc = await ctx.runtime.models.SiteModel.findById(site.id).lean()
    const dbOnlyFile = await ctx.runtime.models.ContentModel.create({
      name: 'welcome.txt',
      key: 'seed-welcome.txt',
      contentType: 'text/plain',
      extension: 'txt',
      uploadedBy: user.id,
      uploadedAt: new Date(),
      owner: siteDoc!._id,
      site: siteDoc!._id,
      parent: folder.id,
      parentType: 'Content',
      kind: 'File',
      status: 'active',
      visibility: 'public',
      size: 42,
      attributes: {},
    })
    await ctx.runtime.search.indexFile({
      id: pdfFile.id,
      siteId: site.id,
      siteName: site.name,
      name: pdfFile.name,
      key: pdfFile.key,
      contentType: pdfFile.contentType,
      size: pdfFile.size,
      uploadedAt: pdfFile.uploadedAt,
      updatedAt: pdfFile.updatedAt,
      extractedText: 'Full-year 2023 GMV: $235.9 billion. Q1 2024 GMV: $60.9 billion.',
      extractionStatus: 'complete',
    })
    await ctx.runtime.search.indexFile({
      id: mdFile.id,
      siteId: site.id,
      siteName: site.name,
      folderId: childFolder.id,
      folderName: childFolder.name,
      name: mdFile.name,
      key: mdFile.key,
      contentType: mdFile.contentType,
      size: mdFile.size,
      uploadedAt: mdFile.uploadedAt,
      updatedAt: mdFile.updatedAt,
      extractedText: 'Shopify GMV grew strongly.',
      extractionStatus: 'complete',
    })

    await agent.get(`/api/site/${site.id}/file/${jsonFile.id}`).expect(200).expect(({ body }) => {
      expect(body.file.contentType).toBe('application/json')
      expect(body.file.viewUrl).toBe(`/api/files/view/${jsonFile.id}`)
      expect(body.file.downloadUrl).toBe(`/api/files/download/${jsonFile.id}`)
      expect(body.file.viewUrl).not.toContain(jsonFile.key)
      expect(body.file.downloadUrl).not.toContain(jsonFile.key)
    })
    const jsonViewUrl = await agent.get(`/api/site/${site.id}/file/${jsonFile.id}/token`).query({ purpose: 'view' }).expect(200).then(res => res.body.url)
    const mdDownloadUrl = await agent.get(`/api/site/${site.id}/file/${mdFile.id}/token`).query({ purpose: 'download' }).expect(200).then(res => res.body.url)
    expect(jsonViewUrl).toContain(`/api/files/view/${jsonFile.id}?token=`)
    expect(jsonViewUrl).not.toContain(jsonFile.key)
    expect(mdDownloadUrl).toContain(`/api/files/download/${mdFile.id}?token=`)
    expect(mdDownloadUrl).not.toContain(mdFile.key)
    await agent.get(jsonViewUrl).expect(200).expect('content-type', /json/)
    await agent.get(mdDownloadUrl).expect(200).expect('content-disposition', /attachment/)
    await expect(ctx.runtime.models.ActivityModel.findOne({
      action: 'file-viewed',
      target: jsonFile.id,
      onModel: 'Content',
      parent: site.id,
      parentOnModel: 'Site',
    }).lean()).resolves.toMatchObject({
      attributes: expect.objectContaining({ fileName: jsonFile.name }),
    })
    await expect(ctx.runtime.models.ActivityModel.findOne({
      action: 'file-downloaded',
      target: mdFile.id,
      onModel: 'Content',
      parent: site.id,
      parentOnModel: 'Site',
    }).lean()).resolves.toMatchObject({
      attributes: expect.objectContaining({ fileName: mdFile.name }),
    })

    await agent.post(`/api/site/${site.id}/search`).send({ q: 'GMV' }).expect(200).expect(({ body }) => {
      expect(body.results.some((result: any) => result.id === mdFile.id || result.id === pdfFile.id)).toBe(true)
    })
    await agent.post(`/api/site/${site.id}/search`).send({ q: 'welcome.txt' }).expect(200).expect(({ body }) => {
      expect(body.results).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: String(dbOnlyFile._id), name: 'welcome.txt' }),
      ]))
    })
    await agent.post('/api/search').send({ q: 'welcome.txt' }).expect(200).expect(({ body }) => {
      expect(body.results).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: String(dbOnlyFile._id), name: 'welcome.txt' }),
      ]))
    })
    await agent.post('/api/search').send({ q: '@contentType: application/pdf' }).expect(200).expect(({ body }) => {
      expect(body.results.some((result: any) => result.id === pdfFile.id)).toBe(true)
    })

    await agent.post('/api/activities').send({
      action: 'viewed',
      target: jsonFile.id,
      onModel: 'Content',
      parent: site.id,
      parentOnModel: 'Site',
      attributes: { source: 'test' },
    }).expect(201)
    await agent.get('/api/analytics/dashboard').expect(200).expect(({ body }) => {
      expect(body.totalOwnedOrAdministeredSites).toBeGreaterThanOrEqual(1)
      expect(body.totalContent).toBeGreaterThanOrEqual(3)
      expect(body.mostAccessedContent).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: jsonFile.id, name: jsonFile.name }),
      ]))
    })

    await processPendingNotifications({ models: ctx.runtime.models, providers: ctx.runtime.providers })

    const key = await agent.post('/api/account/access-keys').send({
      name: 'MCP Test Key',
      keyType: 'mcp',
      scopes: ['mcp:read', 'mcp:write'],
    }).expect(201).then(res => res.body.key as string)
    await callMcp(key, 'clearideas.list_sites', {}).expect(({ body }) => {
      expect(body.result.sites.some((entry: any) => entry.id === site.id)).toBe(true)
    })
    await callMcp(key, 'clearideas.create_folder', { siteId: site.id, folderId: folder.id, name: 'MCP Nested' }).expect(({ body }) => {
      expect(body.result.folder.parentId).toBe(folder.id)
    })
    await callMcp(key, 'clearideas.retrieve_file_content', { contentId: mdFile.id }).expect(({ body }) => {
      expect(body.result.content).toContain('Shopify GMV')
    })
    const chatController = new SiteChatController({
      auth: ctx.runtime.auth,
      models: ctx.runtime.models,
      providers: ctx.runtime.providers,
      search: ctx.runtime.search,
    })
    const chatTools = (chatController as any).buildSiteChatTools({ _id: site.id, name: site.name, files: [], folders: [] }, site.id)
    const pdfContent = await chatTools.retrieve_file_content.execute({ contentId: pdfFile.id, maxTokens: 4000 })
    expect(pdfContent).not.toHaveProperty('error')
    expect(pdfContent.content).toContain('Sample report revenue increased in 2023.')
    await expect(ctx.runtime.models.ContentModel.findById(pdfFile.id).select('+extractedText').lean()).resolves.toMatchObject({
      extractionStatus: 'complete',
      extractedText: expect.stringContaining('Sample report revenue increased in 2023.'),
    })

    const uploader = await agent.post(`/api/site/${site.id}/users`).send({
      email: 'mcp-uploader@clearideas.local',
      displayName: 'MCP Uploader',
      siteRole: 'uploader',
    }).expect(200).then(res => res.body.user)
    const uploaderAgent = supertest.agent(ctx.runtime.app)
    await signIn({ agent: uploaderAgent, email: ctx.email, address: uploader.email, name: 'MCP Uploader' })
    const uploaderKey = await uploaderAgent.post('/api/account/access-keys').send({
      name: 'MCP Uploader Key',
      keyType: 'mcp',
      scopes: ['mcp:read', 'mcp:write'],
    }).expect(201).then(res => res.body.key as string)
    await agent.post('/api/mcp').set('authorization', `Bearer ${uploaderKey}`).send({
      tool: 'clearideas.create_folder',
      args: { siteId: site.id, folderId: folder.id, name: 'Uploader MCP Folder' },
    }).expect(200).expect(({ body }) => {
      expect(body.result.folder.parentId).toBe(folder.id)
    })
  })

  it('adds an existing user to a site through the site membership endpoint with a selected role', async () => {
    const site = await createSite('Membership Site')
    ctx.email.clear()
    const createdMember = await agent.post(`/api/site/${site.id}/users`).send({ email: 'member@clearideas.local', displayName: 'Member User', siteRole: 'viewer' }).expect(200).then(res => res.body.user)
    expect(createdMember.status).toBe('pending-invite')
    expect(ctx.email.lastTemplate('site-invitation')).toBeUndefined()
    const memberRuntimeAgent = supertest.agent(ctx.runtime.app)
    const member = await signIn({ agent: memberRuntimeAgent, email: ctx.email, address: createdMember.email, name: 'Member User' })

    await agent.post(`/api/site/${site.id}/users`).send({ email: member.email, displayName: 'Member User', siteRole: 'viewer' }).expect(200)
    await agent.get(`/api/site/${site.id}/users`).expect(200).expect(({ body }) => {
      const row = body.users.find((entry: any) => entry.id === member.id)
      expect(row).toMatchObject({ email: member.email })
      expect(row.sites.find((entry: any) => entry.siteId === site.id)).toMatchObject({ role: 'viewer' })
    })
    await agent.put(`/api/site/${site.id}/user/${member.id}`).send({ role: 'editor' }).expect(200)
    await agent.patch(`/api/site/${site.id}/user/${member.id}/resend`).expect(200).expect(({ body }) => {
      expect(body.success).toBe(false)
    })
    expect(ctx.email.lastTemplate('site-invitation')).toBeUndefined()
    await agent.patch(`/api/sites/${site.id}`).send({ visibility: 'public' }).expect(200)
    const inviteEmail = ctx.email.lastTemplate('site-invitation')
    expect(inviteEmail?.to).toBe(member.email)
    expect(String(inviteEmail?.templateModel?.action_url)).toContain('code=')
    await agent.get(`/api/site/${site.id}/users`).expect(200).expect(({ body }) => {
      const row = body.users.find((entry: any) => entry.id === member.id)
      expect(row.status).toBe('active')
    })
  })

  it('marks manually accepted private site invitations as accepted membership', async () => {
    const site = await createSite('Manual Accept Site')
    const invited = await createStandaloneUser('manual-accept@clearideas.local', 'Manual Accept')
    await invited.updateOne({ $set: { 'attributes.sites.autoAcceptInvites': false } })
    await agent.post(`/api/site/${site.id}/users`).send({ email: invited.email, displayName: invited.displayName, siteRole: 'viewer' }).expect(200)

    const invitedAgent = supertest.agent(ctx.runtime.app)
    await signIn({ agent: invitedAgent, email: ctx.email, address: invited.email, name: invited.displayName })
    await invitedAgent.patch(`/api/site/${site.id}/invitation/accept`).send({}).expect(200)

    const siteDoc = await ctx.runtime.models.SiteModel.findById(site.id).lean()
    const member = siteDoc?.members.find((entry: any) => String(entry.user) === String(invited._id))
    expect(member?.acceptedAt).toBeTruthy()
    expect(member?.declinedAt ?? null).toBeNull()
    await agent.patch(`/api/sites/${site.id}`).send({ visibility: 'public' }).expect(200)
    await invitedAgent.get('/api/sites').expect(200).expect(({ body }) => {
      expect(body.sites.find((entry: any) => entry.id === site.id)).toMatchObject({ currentUserRole: 'viewer' })
    })
  })

  it('enforces site authorization for private reads, content writes, uploads, downloads, and activities', async () => {
    const site = await createSite('Private Security Site')
    const folder = await agent.post(`/api/sites/${site.id}/folders`).send({ name: 'Private Folder' }).expect(201).then(res => res.body.folder)
    const file = await uploadFile({
      siteId: site.id,
      folderId: folder.id,
      fileName: 'private-notes.md',
      contentType: 'text/markdown',
      body: Buffer.from('# Private notes'),
    })

    const outsiderAgent = supertest.agent(ctx.runtime.app)
    await createStandaloneUser('outsider@clearideas.local', 'Outsider User')
    await signIn({ agent: outsiderAgent, email: ctx.email, address: 'outsider@clearideas.local', name: 'Outsider User' })

    await outsiderAgent.get(`/api/sites/${site.id}`).expect(403)
    await outsiderAgent.get(`/api/site/${site.id}/file/${file.id}/token`).query({ purpose: 'view' }).expect(403)
    await agent.patch(`/api/sites/${site.id}`).send({ attributes: { ai: { enabled: true, chatEnabled: true } } }).expect(200)
    await agent.post(`/api/sites/${site.id}/chat`).send({
      id: 'transport-request',
      trigger: 'submit-message',
      messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
    }).expect(400).expect(({ body }) => {
      expect(body.error).toBe('Invalid request.')
    })
    await outsiderAgent.post(`/api/sites/${site.id}/chat`).send({
      messages: [{ id: 'outsider-message', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
    }).expect(403)
    await outsiderAgent.post(`/api/sites/${site.id}/folders`).send({ name: 'Nope' }).expect(403)
    await outsiderAgent.post('/api/files/upload-target').send({
      siteId: site.id,
      folderId: folder.id,
      fileName: 'nope.txt',
      contentType: 'text/plain',
      size: 4,
    }).expect(403)
    await outsiderAgent.get(`/api/files/view/${encodeURIComponent(file.key)}`).expect(400)
    await outsiderAgent.get('/api/files/download/not-a-real-key.txt').expect(400)
    await outsiderAgent.post('/api/activities').send({
      action: 'viewed',
      target: file.id,
      onModel: 'Content',
      parent: site.id,
      parentOnModel: 'Site',
      attributes: { source: 'forged-test' },
    }).expect(403)

    const viewer = await agent.post(`/api/site/${site.id}/users`).send({
      email: 'viewer@clearideas.local',
      displayName: 'Viewer User',
      siteRole: 'viewer',
    }).expect(200).then(res => res.body.user)
    const viewerAgent = supertest.agent(ctx.runtime.app)
    await signIn({ agent: viewerAgent, email: ctx.email, address: viewer.email, name: 'Viewer User' })
    await viewerAgent.get(`/api/sites/${site.id}`).expect(200)
    await viewerAgent.get(`/api/site/${site.id}/file/${file.id}/token`).query({ purpose: 'view' }).expect(200)
    await viewerAgent.get(`/api/site/${site.id}/file/${file.id}/token`).query({ purpose: 'download' }).expect(403)
    await viewerAgent.delete(`/api/site/${site.id}/content/${folder.id}`).expect(403)
    await viewerAgent.post('/api/files/upload-target').send({
      siteId: site.id,
      folderId: folder.id,
      fileName: 'viewer-upload.txt',
      contentType: 'text/plain',
      size: 6,
    }).expect(403)
  })

  it('enforces HTTPS only when explicitly required', async () => {
    await agent.get('/api/health').expect(200)
    const secureRuntime = await createTestCeRuntime()
    try {
      const app = secureRuntime.runtime.app
      await import('supertest').then(({ default: request }) => request(app).get('/api/health').expect(200))
    } finally {
      await secureRuntime.close()
    }
  })

  it('can hide bundled operator documentation', async () => {
    const hiddenDocs = await createTestCeRuntime({ env: { CLEARIDEAS_DOCS_ENABLED: 'false' } })
    try {
      await hiddenDocs.agent.get('/api/app-config').expect(200).expect(({ body }) => {
        expect(body).toMatchObject({ docsEnabled: false })
      })
      await hiddenDocs.agent.get('/docs').expect(404)
      await hiddenDocs.agent.get('/docs/index.json').expect(404)
      await hiddenDocs.agent.get('/sites').expect(200).expect('content-type', /html/)
    } finally {
      await hiddenDocs.close()
    }
  })

  async function createSite(name: string) {
    return agent.post('/api/sites').send({ name }).expect(201).then(res => res.body.site as { id: string; name: string })
  }

  async function uploadFile(input: { siteId: string; folderId?: string; fileName: string; contentType: string; body: Buffer }) {
    const target = await agent.post('/api/files/upload-target').send({
      siteId: input.siteId,
      folderId: input.folderId,
      fileName: input.fileName,
      contentType: input.contentType,
      size: input.body.length,
    }).expect(200).then(res => res.body.target as { url: string; fileId: string; fileKey: string; headers?: Record<string, string> })
    expect(target.url).toBe(`/api/files/upload/${target.fileId}`)
    expect(target.url).not.toContain(target.fileKey)
    await agent.put(target.url).set({ 'content-type': input.contentType, ...(target.headers ?? {}) }).send(input.body).expect(200)
    const site = await agent.get(`/api/sites/${input.siteId}`).expect(200).then(res => res.body.site)
    const files = [
      ...(site.files ?? []),
      ...(site.folders ?? []).flatMap((folder: any) => folder.files ?? []),
    ]
    const file = files.find((entry: any) => entry.key === target.fileKey)
    if (!file) throw new Error(`Uploaded file ${input.fileName} was not returned by get site`)
    return file
  }

  function callMcp(key: string, tool: string, args: Record<string, unknown>) {
    return agent.post('/api/mcp').set('authorization', `Bearer ${key}`).send({ tool, args }).expect(200)
  }

  async function createStandaloneUser(email: string, displayName: string) {
    const user = await ctx.runtime.models.UserModel.create({
      email,
      displayName,
      status: 'active',
      roles: ['member'],
      attributes: createDefaultUserAttributes(),
    })
    await ctx.runtime.models.AccountModel.create({
      name: `${displayName}'s Workspace`,
      owner: user._id,
      attributes: {},
    })
    return user
  }

  function testPdfBuffer() {
    return Buffer.from(
      'JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMzAKPj4Kc3RyZWFtCnicLYpBCkIxDET3OUXWgpgm7aQfxIVaceFG6AVEvqLoQhHPb6sS8ph5yYOWlYT7PM8024639/i6HA9TlyHHLJ4HDpHribRxR+H7Gjg2qHC90zwZAtYuWCGpuCK1vHH1+G9AQvHUrxhQYN0iuDXGn1Mxtb6mZcH1SnVCpdKePjWbIokKZW5kc3RyZWFtCmVuZG9iagoKNyAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDUKL0ZpcnN0IDI2Ci9MZW5ndGggMzYxCj4+CnN0cmVhbQp4nNVSTUvDQBC976+Yox5kJ5tvKYW2SRSkKK2gKB7SZCmRsivJVuq/dyZJLT2IZwmP3Zl5s/s28zxAUBAE4EOcQAChryCE2PNgMhHy8etDg3wot7oT8q6pO3glDsIK3oRc2L1x4InpVJy4i9KVO7sVQxN4TD4yHlpb7yvdwqTIiwIxRsQoIESIKqN1QUgJimKqqYT2hDgYQbnYR/RnVCsGRPHQw/WeG479Oa3EjZiTDdwgGeKfe/mufDhD/aUnnQq5tHVWOg0X2bVCFWGo0POV76Uvl/Q7Wl06+38f1+tvrPn1hWdz5vHykFvNHuinLFe6s/u2orEzr7BU4c2t3n1q11TlVYxpQjrjJCWPjcaQz/ebd131VA7zg7tZO9YwJDi31HVTzu2B3If0BYo8i8genBljHbuy96NxpIajaPTomWQWJOR6v3F9yElPyHnZ6V7qSSeJMJWtG7MF+dSYmemaY4JP/AYQp8XVCmVuZHN0cmVhbQplbmRvYmoKCjggMCBvYmoKPDwKL1NpemUgOQovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDQyCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDkgXQo+PgpzdHJlYW0KeJxjYGD4/5+JgZ2BAUQwgggmEMEMIlgYGQQYGBgZbgMJplUMDABieAPQCmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgo2ODIKJSVFT0Y=',
      'base64',
    )
  }
})
