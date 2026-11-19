/**
 * In-memory fake of the CE HTTP API, served through `fetch` (plan item 4.2).
 *
 * Feature tests mount real views with real Pinia stores; the only fake is the network. Because
 * requests go through the real `api/client.ts` → `fetchPrivate`, the contracts-core request
 * schemas and error handling are exercised too. Every request is recorded in `backend.requests`;
 * a request with no matching route fails loudly (`backend.unhandled`) so tests notice new calls.
 *
 *   const backend = installFakeBackend()          // in beforeEach
 *   backend.state.sites[0].name = 'Renamed'       // tweak the seed
 *   backend.failNext('PATCH', '/api/profile', 500, { error: 'Nope' })
 *   expect(backend.calls('POST', '/api/sites')).toHaveLength(1)
 */
import type { ChatMessage, ChatSource, Site, User } from '../../../src-web/src/types/domain'
import { createSeed, file as makeFile, ID, type Seed } from './index'

export { ID } from './index'

type Json = unknown
type Handler = (input: {
  params: Record<string, string>
  query: URLSearchParams
  body: Json
  state: Seed
}) => Json | Promise<Json> | Response

export interface RecordedRequest {
  method: string
  path: string
  query: URLSearchParams
  body: Json
}

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public payload: Json,
  ) {
    super(`HTTP ${status}`)
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function siteSummary(site: Site) {
  const { files: _files, folders: _folders, ...summary } = site
  const allFiles = [...(site.files ?? []), ...site.folders.flatMap(folder => folder.files)]
  return {
    ...summary,
    attributes: {
      ...(site.attributes ?? {}),
      totalActiveSize: allFiles.reduce((sum, item) => sum + (item.size ?? 0), 0),
      latestUpdatedAt: site.updatedAt,
    },
  }
}

function findSite(state: Seed, siteId: string) {
  const site = state.sites.find(candidate => candidate.id === siteId)
  if (!site) throw new HttpError(404, { error: 'Site not found' })
  return site
}

function allFilesOf(site: Site) {
  return [
    ...(site.files ?? []).map(item => ({
      item,
      folder: undefined as undefined | { id: string; name: string },
    })),
    ...site.folders.flatMap(folder => folder.files.map(item => ({ item, folder }))),
  ]
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const existing = target[key]
      target[key] = deepMerge(
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as Record<string, unknown>)
          : {},
        value as Record<string, unknown>,
      )
    } else {
      target[key] = value
    }
  }
  return target
}

let idCounter = 0x1000
/** New ids are ObjectId-shaped too (`67…`), distinct from the seeded `66…` ones. */
const nextId = (_kind: string) => `67${(++idCounter).toString(16).padStart(22, '0')}`

export function createFakeBackend(seed: Seed = createSeed()) {
  const state = seed
  const requests: RecordedRequest[] = []
  const unhandled: string[] = []
  const failures: Array<{ method: string; path: string; status: number; payload: Json }> = []
  const routes: Route[] = []
  /** Overrides for read-only reports (analytics etc.). */
  const responses: Record<string, Json> = {}
  /** Bytes served for `/api/files/view|download/:fileId`. */
  const fileBodies: Record<string, string | Uint8Array> = {}

  function route(method: string, path: string, handler: Handler) {
    const keys: string[] = []
    const pattern = new RegExp(
      `^${path.replace(/:([a-zA-Z]+)/g, (_match, key: string) => {
        keys.push(key)
        return '([^/]+)'
      })}$`,
    )
    routes.push({ method, pattern, keys, handler })
  }

  const requireSession = () => {
    if (!state.session) throw new HttpError(401, { error: 'Unauthorized' })
  }

  // ---- auth -------------------------------------------------------------------------------
  route('GET', '/api/auth/session', () => {
    requireSession()
    return state.session
  })
  route('POST', '/api/auth/code/send', () => ({ success: true }))
  route('POST', '/api/auth/code/verify', ({ body }) => {
    const { email, code } = body as { email: string; code: string }
    if (code !== '123456') throw new HttpError(400, { error: 'Invalid code' })
    state.session = { user: { id: state.profile.id, email, name: state.profile.displayName ?? email } }
    return state.session
  })
  route('POST', '/api/auth/logout', () => {
    state.session = null as never
    return { ok: true }
  })
  route('GET', '/api/auth/get-session', () => {
    if (!state.session) return null
    const current = state.authSessions.find(item => item.id === state.currentSessionId)
    return { session: current ? { id: current.id, token: current.token } : null, user: state.session.user }
  })
  route('GET', '/api/auth/list-sessions', () => {
    requireSession()
    return state.authSessions
  })
  route('POST', '/api/auth/revoke-session', ({ body }) => {
    const { token } = body as { token: string }
    state.authSessions = state.authSessions.filter(item => item.token !== token)
    return { status: true }
  })
  route('POST', '/api/auth/revoke-other-sessions', () => {
    state.authSessions = state.authSessions.filter(item => item.id === state.currentSessionId)
    return { status: true }
  })
  route('GET', '/api/app-config', () => ({ docsEnabled: false }))
  route('GET', '/api/health', () => ({ status: 'ok', app: 'ok', db: 'ok', date: new Date().toISOString() }))

  // ---- profile / account ------------------------------------------------------------------
  route('GET', '/api/account/me', () => ({ account: state.account, user: state.profile }))
  route('PATCH', '/api/account', ({ body }) => {
    Object.assign(state.account, body as object)
    return { account: state.account }
  })
  route('GET', '/api/profile', () => ({ profile: state.profile }))
  route('PATCH', '/api/profile', ({ body }) => {
    const input = body as { displayName?: string; attributes?: Record<string, unknown> }
    if (input.displayName !== undefined) state.profile.displayName = input.displayName
    if (input.attributes) {
      state.profile.attributes = deepMerge(
        (state.profile.attributes ?? {}) as Record<string, unknown>,
        input.attributes,
      ) as User['attributes']
    }
    return { profile: state.profile }
  })

  // ---- sites ------------------------------------------------------------------------------
  route('GET', '/api/sites', () => ({
    sites: state.sites
      .filter(site => !(state.profile.attributes?.sites?.suppressedSites ?? []).includes(site.id))
      .map(siteSummary),
  }))
  route('GET', '/api/sites/suppressed', () => ({ sites: state.suppressedSites.map(siteSummary) }))
  route('POST', '/api/sites', ({ body }) => {
    const { name } = body as { name: string }
    const site: Site = {
      id: nextId('site'),
      name,
      visibility: 'private',
      owned: true,
      currentUserRole: 'owner',
      tags: [],
      members: [{ userId: state.profile.id, role: 'owner' }],
      attributes: {},
      files: [],
      folders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.sites.push(site)
    return { site }
  })
  route('GET', '/api/sites/:siteId', ({ params }) => ({ site: findSite(state, params.siteId) }))
  route('PATCH', '/api/sites/:siteId', ({ params, body }) => {
    const site = findSite(state, params.siteId)
    const input = body as Partial<Site> & { attributes?: Record<string, unknown> }
    const { attributes, ...rest } = input
    Object.assign(site, rest)
    if (attributes)
      site.attributes = deepMerge((site.attributes ?? {}) as Record<string, unknown>, attributes)
    return { site }
  })
  route('POST', '/api/sites/:siteId/folders', ({ params, body }) => {
    const site = findSite(state, params.siteId)
    const { name, folderId } = body as { name: string; folderId?: string }
    const created = {
      id: nextId('folder'),
      name,
      parentId: folderId,
      files: [],
      createdAt: new Date().toISOString(),
    }
    site.folders.push(created)
    return { folder: created }
  })
  route('DELETE', '/api/site/:siteId/content/:contentId', ({ params }) => {
    const site = findSite(state, params.siteId)
    site.files = (site.files ?? []).filter(item => item.id !== params.contentId)
    site.folders = site.folders.filter(item => item.id !== params.contentId)
    for (const f of site.folders) f.files = f.files.filter(item => item.id !== params.contentId)
    return {}
  })
  route('PUT', '/api/site/:siteId/content/:contentId', ({ params, body }) => {
    const site = findSite(state, params.siteId)
    const { name } = body as { name: string }
    const target =
      allFilesOf(site).find(entry => entry.item.id === params.contentId)?.item ??
      site.folders.find(item => item.id === params.contentId)
    if (!target) throw new HttpError(404, { error: 'Content not found' })
    target.name = name
    return { content: { id: params.contentId, name } }
  })
  route('GET', '/api/site/:siteId/file/:fileId', ({ params }) => {
    const site = findSite(state, params.siteId)
    const entry = allFilesOf(site).find(candidate => candidate.item.id === params.fileId)
    if (!entry) throw new HttpError(404, { error: 'File not found' })
    return {
      file: {
        ...entry.item,
        kind: 'file',
        site: site.id,
        siteId: site.id,
        siteName: site.name,
        folderId: entry.folder?.id,
        folderName: entry.folder?.name,
      },
    }
  })
  route('GET', '/api/site/:siteId/file/:fileId/token', ({ params, query }) => ({
    token: 'file-token',
    url: `/api/files/${query.get('purpose') ?? 'view'}/${params.fileId}?token=file-token`,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }))
  // File bytes behind the tokenised view/download URLs. Override per test with `backend.fileBodies`.
  for (const purpose of ['view', 'download']) {
    route('GET', `/api/files/${purpose}/:fileId`, ({ params }) => {
      const body = fileBodies[params.fileId] ?? `Content of ${params.fileId}`
      return new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    })
  }
  route('POST', '/api/files/upload-target', ({ body }) => {
    const input = body as {
      siteId: string
      folderId?: string
      fileName: string
      contentType?: string
      size?: number
    }
    const fileId = nextId('file')
    const site = findSite(state, input.siteId)
    const created = makeFile(fileId, input.fileName, { contentType: input.contentType, size: input.size })
    const parent = input.folderId ? site.folders.find(item => item.id === input.folderId) : undefined
    if (parent) parent.files.push(created)
    else site.files = [...(site.files ?? []), created]
    return {
      target: { method: 'PUT', url: `/api/files/upload/${fileId}`, fileId, fileKey: `keys/${fileId}` },
    }
  })
  route('POST', '/api/site/:siteId/search', ({ params, body }) => {
    const site = findSite(state, params.siteId)
    const q = String((body as { q: string }).q).toLowerCase()
    return {
      results: allFilesOf(site)
        .filter(entry => entry.item.name.toLowerCase().includes(q.replace(/@\w+:\S+/g, '').trim()))
        .map(entry => ({ ...entry.item, site: site.id, siteName: site.name })),
    }
  })
  route('POST', '/api/search', ({ body }) => {
    const q = String((body as { q: string }).q).toLowerCase()
    return {
      results: state.sites.flatMap(site =>
        allFilesOf(site)
          .filter(entry => entry.item.name.toLowerCase().includes(q.replace(/@\w+:\S+/g, '').trim()))
          .map(entry => ({ ...entry.item, site: site.id, siteName: site.name })),
      ),
    }
  })
  for (const action of ['accept', 'decline', 'suppress'] as const) {
    route('PATCH', `/api/site/:siteId/invitation/${action}`, ({ params }) => {
      if (action === 'suppress') {
        const site = findSite(state, params.siteId)
        state.suppressedSites.push(site)
        const sites = (state.profile.attributes ??= {}).sites ?? {}
        sites.suppressedSites = [...(sites.suppressedSites ?? []), site.id]
        state.profile.attributes.sites = sites
      }
      return { message: 'ok' }
    })
  }

  // ---- users --------------------------------------------------------------------------------
  route('GET', '/api/users', () => ({ users: state.users }))
  // Like core's listSiteUsers: the site's members, each with `sites` scoped to this site only.
  route('GET', '/api/site/:siteId/users', ({ params }) => {
    const site = findSite(state, params.siteId)
    return {
      users: (site.members ?? []).flatMap(member => {
        const user = state.users.find(candidate => candidate.id === member.userId)
        return user
          ? [{ ...user, sites: [{ siteId: site.id, name: site.name, role: member.role ?? 'viewer' }] }]
          : []
      }),
    }
  })
  route('POST', '/api/site/:siteId/users', ({ params, body }) => {
    const input = body as { email: string; displayName?: string; siteRole?: string }
    const site = findSite(state, params.siteId)
    const user: User = {
      id: nextId('user'),
      email: input.email,
      displayName: input.displayName,
      status: 'invited',
      sites: [{ siteId: site.id, name: site.name, role: input.siteRole ?? 'viewer' }],
    }
    state.users.push(user)
    site.members = [...(site.members ?? []), { userId: user.id, role: input.siteRole ?? 'viewer' }]
    return { user }
  })
  route('PUT', '/api/site/:siteId/user/:userId', ({ params, body }) => {
    const { role } = body as { role: string }
    const site = findSite(state, params.siteId)
    const member = site.members?.find(item => item.userId === params.userId)
    if (!member) throw new HttpError(404, { error: 'User is not a member of this site' })
    member.role = role
    const user = state.users.find(item => item.id === params.userId)
    const membership = user?.sites?.find(item => item.siteId === params.siteId)
    if (membership) membership.role = role
    return { user }
  })
  route('DELETE', '/api/site/:siteId/user/:userId', ({ params }) => {
    const site = findSite(state, params.siteId)
    site.members = (site.members ?? []).filter(item => item.userId !== params.userId)
    return { message: 'removed' }
  })
  route('PATCH', '/api/site/:siteId/user/:userId/resend', () => ({ message: 'sent' }))
  route('DELETE', '/api/user/:userId', ({ params }) => {
    state.users = state.users.filter(item => item.id !== params.userId)
    return { message: 'removed' }
  })
  route('GET', '/api/user-groups', () => ({ userGroups: state.userGroups }))
  route('POST', '/api/user-groups', ({ body }) => {
    const input = body as { name: string; users?: string[] }
    const group = { id: nextId('group'), name: input.name, users: input.users ?? [], members: [] }
    state.userGroups.push(group)
    return { userGroup: group }
  })
  route('PATCH', '/api/users/group/:groupId/users', ({ params, body }) => {
    const group = state.userGroups.find(item => item.id === params.groupId)!
    group.users = [...new Set([...(group.users ?? []), ...(body as { users: string[] }).users])]
    group.members = state.users.filter(user => group.users!.includes(user.id))
    return { userGroup: group }
  })
  route('DELETE', '/api/users/group/:groupId/user/:userId', ({ params }) => {
    const group = state.userGroups.find(item => item.id === params.groupId)!
    group.users = (group.users ?? []).filter(id => id !== params.userId)
    group.members = (group.members ?? []).filter(user => user.id !== params.userId)
    return { userGroup: group }
  })

  // ---- access keys ----------------------------------------------------------------------------
  route('GET', '/api/account/access-keys', () => ({ accessKeys: state.accessKeys }))
  route('GET', '/api/account/access-keys/types', () => ({
    keyTypes: { mcp: ['mcp:read', 'mcp:write'], webhook: ['receive_events'] },
  }))
  route('POST', '/api/account/access-keys', ({ body }) => {
    const input = body as { name: string; keyType: string; scopes: string[]; expiresIn?: number }
    const key = {
      id: nextId('key'),
      name: input.name,
      keyType: input.keyType,
      scopes: input.scopes,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
    }
    state.accessKeys.push(key)
    return { key: 'ci_live_secret_value', accessKey: key }
  })
  route('DELETE', '/api/account/access-keys/:keyId', ({ params }) => {
    const key = state.accessKeys.find(item => item.id === params.keyId)
    if (key) key.isActive = false
    return { message: 'revoked' }
  })

  // ---- analytics / agents (read-only defaults, overridable via `respond`) --------------------
  const report =
    (name: string, fallback: Json): Handler =>
    () =>
      responses[name] ?? fallback
  route(
    'GET',
    '/api/analytics/dashboard',
    report('dashboard', {
      storageSize: 1_500_000,
      totalContent: 7,
      totalSites: 3,
      totalOwnedOrAdministeredSites: 2,
      monthlyActiveUsers: 3,
      mostAccessedContent: [{ id: 'file-roadmap', name: 'Roadmap.pdf', count: 12 }],
      mostActiveUsers: [{ id: 'user-grace', name: 'Grace Hopper', count: 30 }],
      contentActivity: [
        { name: 'viewed', count: 40 },
        { name: 'uploaded', count: 6 },
      ],
    }),
  )
  for (const name of ['most-accessed', 'most-active', 'content-activity', 'search-terms', 'usage-times']) {
    route(
      'POST',
      `/api/analytics/${name}`,
      report(name, {
        rows:
          name === 'usage-times'
            ? [
                { hour: 9, count: 10 },
                { hour: 14, count: 4 },
              ]
            : [{ id: 'row-1', name: name === 'search-terms' ? 'budget' : 'Roadmap.pdf', count: 5 }],
      }),
    )
  }
  route(
    'POST',
    '/api/analytics/monthly-active-users',
    report('monthly-active-users', { monthlyActiveUsers: 3 }),
  )
  // ---- chat (Ask / Site AI; turns stream an AI SDK UI message stream like the server) ----------
  const chatState = {
    configured: true,
    models: ['openai:gpt-4.1-mini'],
    conversations: [] as Array<{
      id: string
      title: string
      siteId: string | null
      createdAt: string
      updatedAt: string
      messages: ChatMessage[]
    }>,
    /** The answer to the next question (default: names the roadmap as its source). */
    reply: (question: string): { text: string; sources: ChatSource[]; status?: string[] } => ({
      text: `Here is what I found about “${question}” in Roadmap.pdf.`,
      status: ['Searching for “roadmap”', 'Reading Roadmap.pdf'],
      sources: [
        {
          contentId: ID.roadmap,
          siteId: ID.handbook,
          siteName: 'Product Handbook',
          name: 'Roadmap.pdf',
          contentType: 'application/pdf',
        },
      ],
    }),
  }
  const chatSites = () =>
    state.sites
      .filter(site => site.attributes?.ai?.chatEnabled === true)
      .map(site => ({ id: site.id, name: site.name }))
  const summary = (conversation: (typeof chatState.conversations)[number]) => ({
    id: conversation.id,
    title: conversation.title,
    siteId: conversation.siteId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  })
  const findConversation = (id: string) => {
    const conversation = chatState.conversations.find(item => item.id === id)
    if (!conversation) throw new HttpError(404, { error: 'Conversation not found.' })
    return conversation
  }
  route('GET', '/api/chat/models', () => ({
    defaultModel: chatState.models[0] ?? '',
    models: chatState.models,
    configured: chatState.configured,
  }))
  route('GET', '/api/chat/sites', () => ({ sites: chatSites() }))
  route('GET', '/api/chat/conversations', ({ query }) => ({
    conversations: chatState.conversations
      .filter(item => !query.get('siteId') || item.siteId === query.get('siteId'))
      .map(summary),
  }))
  route('GET', '/api/chat/conversations/:conversationId', ({ params }) => {
    const conversation = findConversation(params.conversationId)
    return { conversation: { ...summary(conversation), messages: conversation.messages } }
  })
  route('PATCH', '/api/chat/conversations/:conversationId', ({ params, body }) => {
    const conversation = findConversation(params.conversationId)
    conversation.title = String((body as { title?: string }).title ?? conversation.title)
    return { conversation: summary(conversation) }
  })
  route('DELETE', '/api/chat/conversations/:conversationId', ({ params }) => {
    findConversation(params.conversationId)
    chatState.conversations = chatState.conversations.filter(item => item.id !== params.conversationId)
    return new Response(null, { status: 204 })
  })
  route('POST', '/api/chat', ({ body }) => {
    const input = body as { conversationId?: string; siteId?: string; message: { id: string; text: string } }
    const now = new Date().toISOString()
    let conversation = input.conversationId ? findConversation(input.conversationId) : undefined
    const siteId = conversation ? conversation.siteId : (input.siteId ?? null)
    if (siteId && !chatSites().some(site => site.id === siteId)) {
      throw new HttpError(403, { error: 'AI chat is not enabled for this site' })
    }
    if (!conversation) {
      conversation = {
        id: nextId('conversation'),
        title: input.message.text.slice(0, 80),
        siteId,
        createdAt: now,
        updatedAt: now,
        messages: [],
      }
      chatState.conversations.unshift(conversation)
    }
    const reply = chatState.reply(input.message.text)
    const answerId = `answer-${conversation.messages.length + 2}`
    conversation.messages.push(
      { id: input.message.id, role: 'user', text: input.message.text, sources: [], createdAt: now },
      { id: answerId, role: 'assistant', text: reply.text, sources: reply.sources, createdAt: now },
    )
    conversation.updatedAt = now
    const chunks = [
      { type: 'start', messageId: answerId },
      {
        type: 'data-conversation',
        data: { id: conversation.id, title: conversation.title, siteId },
        transient: true,
      },
      ...(reply.status ?? []).map(label => ({ type: 'data-status', data: { label }, transient: true })),
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: reply.text },
      { type: 'text-end', id: 't1' },
      ...(reply.sources.length ? [{ type: 'data-sources', data: reply.sources }] : []),
      { type: 'finish' },
    ]
    return new Response(
      `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      },
    )
  })

  // ---- agents (in-memory; runs stream NDJSON like the server) ----------------------------------
  const agentState = {
    runtimeConfigured: true,
    agents: [] as Array<Record<string, unknown> & { id: string; manifest: Record<string, unknown> }>,
    runs: [] as Array<Record<string, unknown> & { runId: string; agentId: string }>,
    schedules: [] as Array<Record<string, unknown> & { id: string; agentId: string }>,
    /** Output the next run streams back. */
    nextOutput: 'The handbook covers leave and travel policies.' as unknown,
    /** Set to make the next run stream an error message instead of a result. */
    nextError: '' as string,
  }
  const findAgent = (id: string) => {
    const agent = agentState.agents.find(item => item.id === id)
    if (!agent) throw new HttpError(404, { error: 'Agent not found' })
    return agent
  }
  route('GET', '/api/agents', () => ({
    agents: agentState.agents,
    runtimeConfigured: agentState.runtimeConfigured,
  }))
  route('POST', '/api/agents', ({ body }) => {
    const manifest = (body as { manifest: Record<string, unknown> }).manifest
    const now = new Date().toISOString()
    const agent = {
      id: nextId('agent'),
      name: String(manifest.name),
      description: String(manifest.description ?? ''),
      manifest,
      revision: 1,
      createdBy: state.profile.id,
      createdAt: now,
      updatedAt: now,
    }
    agentState.agents.push(agent)
    return { agent }
  })
  route('PATCH', '/api/agents/:agentId', ({ params, body }) => {
    const agent = findAgent(params.agentId)
    const manifest = (body as { manifest: Record<string, unknown> }).manifest
    Object.assign(agent, { manifest, name: String(manifest.name), revision: Number(agent.revision) + 1 })
    return { agent }
  })
  route('DELETE', '/api/agents/:agentId', ({ params }) => {
    agentState.agents = agentState.agents.filter(item => item.id !== params.agentId)
    return {}
  })
  route('GET', '/api/agent-runs', ({ query }) => ({
    runs: agentState.runs.filter(run => !query.get('agentId') || run.agentId === query.get('agentId')),
  }))
  route('GET', '/api/agent-runs/:runId', ({ params }) => {
    const run = agentState.runs.find(item => item.runId === params.runId)
    if (!run) throw new HttpError(404, { error: 'Run not found' })
    return { run }
  })
  const streamRun = (agentId: string, siteId?: string) => {
    const now = new Date().toISOString()
    const failed = Boolean(agentState.nextError)
    agentState.runs.unshift({
      runId: nextId('run'),
      agentId,
      agentRevision: 1,
      siteId: siteId ?? null,
      source: 'manual',
      status: failed ? 'failed' : 'completed',
      output: failed ? undefined : agentState.nextOutput,
      error: failed ? { message: agentState.nextError } : undefined,
      transcript: [{ id: 'm1', type: 'message', role: 'assistant' }],
      createdAt: now,
      updatedAt: now,
    })
    const lines = [
      { kind: 'event', event: { type: 'step-started' } },
      failed
        ? { kind: 'error', error: agentState.nextError }
        : { kind: 'result', result: { output: agentState.nextOutput } },
    ]
    agentState.nextError = ''
    return new Response(lines.map(line => JSON.stringify(line)).join('\n'), {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    })
  }
  route('POST', '/api/agents/:agentId/runs', ({ params, body }) =>
    streamRun(findAgent(params.agentId).id, (body as { siteId?: string }).siteId),
  )
  route('POST', '/api/agent-runs/:runId/resume', ({ params }) => {
    const run = agentState.runs.find(item => item.runId === params.runId)
    if (!run) throw new HttpError(404, { error: 'Run not found' })
    return streamRun(run.agentId)
  })
  route('GET', '/api/agents/:agentId/schedules', ({ params }) => ({
    schedules: agentState.schedules.filter(item => item.agentId === params.agentId),
  }))
  route('POST', '/api/agents/:agentId/schedules', ({ params, body }) => {
    const now = new Date().toISOString()
    const schedule = {
      id: nextId('schedule'),
      agentId: params.agentId,
      ...(body as object),
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    }
    agentState.schedules.push(schedule)
    return { schedule }
  })
  route('PATCH', '/api/agent-schedules/:scheduleId', ({ params, body }) => {
    const schedule = agentState.schedules.find(item => item.id === params.scheduleId)!
    Object.assign(schedule, body as object)
    return { schedule }
  })
  route('DELETE', '/api/agent-schedules/:scheduleId', ({ params }) => {
    agentState.schedules = agentState.schedules.filter(item => item.id !== params.scheduleId)
    return {}
  })

  // ---- dispatcher ----------------------------------------------------------------------------
  async function handle(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const method = (init.method ?? 'GET').toUpperCase()
    let body: Json = undefined
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    requests.push({ method, path: url.pathname, query: url.searchParams, body })

    const failureIndex = failures.findIndex(item => item.method === method && item.path === url.pathname)
    if (failureIndex >= 0) {
      const [failure] = failures.splice(failureIndex, 1)
      return json(failure.status, failure.payload)
    }

    // Like the real server: everything but the public auth/config endpoints needs a session.
    if (!state.session && !PUBLIC_PATHS.some(pattern => pattern.test(url.pathname))) {
      return json(401, { error: 'Unauthorized' })
    }

    for (const candidate of routes) {
      if (candidate.method !== method) continue
      const match = candidate.pattern.exec(url.pathname)
      if (!match) continue
      const params = Object.fromEntries(
        candidate.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]),
      )
      try {
        const result = await candidate.handler({ params, query: url.searchParams, body, state })
        if (result instanceof Response) return result
        return json(200, clone(result ?? null))
      } catch (error) {
        if (error instanceof HttpError) return json(error.status, error.payload)
        throw error
      }
    }
    unhandled.push(`${method} ${url.pathname}`)
    return json(404, { error: `Fake backend has no route for ${method} ${url.pathname}` })
  }

  return {
    state,
    agents: agentState,
    chat: chatState,
    fileBodies,
    requests,
    unhandled,
    handle,
    /** Make the next matching request fail with the given status/payload. */
    failNext(method: string, path: string, status: number, payload: Json = { error: 'Request failed' }) {
      failures.push({ method, path, status, payload })
    },
    /** Override a read-only report response (`dashboard`, `most-accessed`, `agents`, …). */
    respond(name: string, payload: Json) {
      responses[name] = payload
    },
    calls(method: string, path: string | RegExp) {
      return requests.filter(
        request =>
          request.method === method &&
          (typeof path === 'string' ? request.path === path : path.test(request.path)),
      )
    },
  }
}

const PUBLIC_PATHS = [
  /^\/api\/auth\/(session|get-session|code\/send|code\/verify|logout)$/,
  /^\/api\/(app-config|health)$/,
]

function json(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export type FakeBackend = ReturnType<typeof createFakeBackend>

/**
 * Create a backend and route the global `fetch` to it for the current test. (No `vitest` import, so
 * the same backend can also serve a real browser from a plain Node process.) Each web test file runs
 * in its own process, so the replaced `fetch` never leaks across files.
 */
export function installFakeBackend(seed?: Seed): FakeBackend {
  const backend = createFakeBackend(seed)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    backend.handle(input, init)) as typeof fetch
  return backend
}
