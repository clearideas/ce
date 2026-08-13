import {
  AccessKeyCreateRequestSchema,
  AgentCreateRequestSchema,
  AgentRunCreateRequestSchema,
  AgentScheduleCreateRequestSchema,
  AgentScheduleUpdateRequestSchema,
  AgentUpdateRequestSchema,
  AccountPatchRequestSchema,
  AnalyticsFilterRequestSchema,
  AuthCodeSendRequestSchema,
  AuthCodeVerifyRequestSchema,
  ContentSearchRequestSchema,
  EmptyObjectRequestSchema,
  FileUploadTargetRequestSchema,
  FolderCreateRequestSchema,
  NonEmptyNameRequestSchema,
  NotificationSendRequestSchema,
  ProfilePatchRequestSchema,
  SitePatchRequestSchema,
  SiteUserPatchRequestSchema,
  UserCreateRequestSchema,
  UserGroupCreateRequestSchema,
  UserGroupUsersAddRequestSchema,
} from '@clearideas/contracts-core'
import type { AccessKey, Account, Agent, AgentRun, AgentSchedule, AgentScheduleDefinition, FileItem, HealthStatus, NotificationSettings, Session, Site, User, UserGroup } from '../types/domain'
import type { AnalyticsFilter, AnalyticsRowsResponse } from '../stores/analytics.store'
import { fetchPrivate } from './fetchPrivate'

const API_BASE_PATH = '/api'

function toApiPath(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (cleanPath === API_BASE_PATH || cleanPath.startsWith(`${API_BASE_PATH}/`)) return cleanPath
  return `${API_BASE_PATH}${cleanPath}`
}

type RequestSchema<T> = {
  safeParse: (payload: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<PropertyKey>; message: string }> } }
}

type MutationMethod = 'POST' | 'PUT' | 'PATCH'
type MutationRequestInit = RequestInit & {
  method: MutationMethod
  bodySchema: RequestSchema<unknown>
}
type NonMutationRequestInit = Omit<RequestInit, 'method'> & {
  method?: 'GET' | 'DELETE'
  bodySchema?: never
}
type SafeRequestInit = NonMutationRequestInit | MutationRequestInit

export async function api<T>(path: string, options: SafeRequestInit = {}): Promise<T> {
  const { bodySchema: _bodySchema, ...fetchOptions } = options as SafeRequestInit & {
    bodySchema?: RequestSchema<unknown>
  }
  return fetchPrivate<T>(toApiPath(path), fetchOptions)
}

function validateRequest<T>(schema: RequestSchema<T>, payload: unknown, context: string): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  const message = result.error.issues
    .map(issue => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
    .join('; ')
  throw new Error(`${context} payload is invalid: ${message}`)
}

function body<T>(schema: RequestSchema<T>, payload: unknown, context: string): string {
  return JSON.stringify(validateRequest(schema, payload, context))
}

export const authApi = {
  session: () => api<Session>('/auth/session'),
  sendCode: (input: { email: string }) =>
    api<{ success: boolean }>('/auth/code/send', { method: 'POST', bodySchema: AuthCodeSendRequestSchema, body: body(AuthCodeSendRequestSchema, input, 'Send auth code') }),
  verifyCode: (input: { email: string; code: string; name?: string }) =>
    api<Session>('/auth/code/verify', { method: 'POST', bodySchema: AuthCodeVerifyRequestSchema, body: body(AuthCodeVerifyRequestSchema, input, 'Verify auth code') }),
  logout: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST', bodySchema: EmptyObjectRequestSchema, body: body(EmptyObjectRequestSchema, {}, 'Logout') }),
}

export type AppConfig = {
  docsEnabled: boolean
}

let appConfigPromise: Promise<AppConfig> | null = null

export const appConfigApi = {
  get: () => {
    appConfigPromise ??= api<AppConfig>('/app-config')
    return appConfigPromise
  },
}

export const ceApi = {
  account: () => api<{ account: Account | null; user: User }>('/account/me'),
  updateAccount: (input: { name?: string; attributes?: Account['attributes'] }) =>
    api<{ account: Account }>('/account', { method: 'PATCH', bodySchema: AccountPatchRequestSchema, body: body(AccountPatchRequestSchema, input, 'Update account') }),
  profile: () => api<{ profile: User }>('/profile'),
  updateProfile: (input: {
    displayName?: string
    attributes?: {
      notifications?: NotificationSettings
      sites?: { autoAcceptInvites?: boolean; favourites?: string[]; suppressedSites?: string[]; suppressNotifications?: string[] }
    }
  }) =>
    api<{ profile: User }>('/profile', { method: 'PATCH', bodySchema: ProfilePatchRequestSchema, body: body(ProfilePatchRequestSchema, input, 'Update profile') }),
  users: () => api<{ users: User[] }>('/users'),
  addSiteUser: (siteId: string, input: { email: string; displayName?: string; siteRole?: string }) =>
    api<{ user: User; message?: string }>(`/site/${siteId}/users`, { method: 'POST', bodySchema: UserCreateRequestSchema, body: body(UserCreateRequestSchema, input, 'Add site user') }),
  siteUsers: (siteId: string) => api<{ users: User[] }>(`/site/${siteId}/users`),
  updateSiteUser: (siteId: string, userId: string, input: { role: string; expiresAt?: string }) =>
    api<{ user: User }>(`/site/${siteId}/user/${userId}`, { method: 'PUT', bodySchema: SiteUserPatchRequestSchema, body: body(SiteUserPatchRequestSchema, input, 'Update site user') }),
  deleteUser: (userId: string) => api<{ message?: string }>(`/user/${userId}`, { method: 'DELETE' }),
  deleteSiteUser: (siteId: string, userId: string) =>
    api<{ message?: string }>(`/site/${siteId}/user/${userId}`, { method: 'DELETE' }),
  resendInvite: (siteId: string, userId: string) =>
    api<{ message?: string }>(`/site/${siteId}/user/${userId}/resend`, { method: 'PATCH', bodySchema: EmptyObjectRequestSchema, body: body(EmptyObjectRequestSchema, {}, 'Resend invite') }),
  userGroups: () => api<{ userGroups: UserGroup[] }>('/user-groups'),
  createUserGroup: (input: { name: string; users?: string[] }) =>
    api<{ userGroup: UserGroup }>('/user-groups', { method: 'POST', bodySchema: UserGroupCreateRequestSchema, body: body(UserGroupCreateRequestSchema, input, 'Create user group') }),
  addUsersToGroup: (groupId: string, users: string[]) =>
    api<{ userGroup: UserGroup }>(`/users/group/${groupId}/users`, {
      method: 'PATCH',
      bodySchema: UserGroupUsersAddRequestSchema,
      body: body(UserGroupUsersAddRequestSchema, { users }, 'Add users to group'),
    }),
  removeUserFromGroup: (groupId: string, userId: string) =>
    api<{ userGroup: UserGroup }>(`/users/group/${groupId}/user/${userId}`, { method: 'DELETE' }),
  sites: () => api<{ sites: Site[] }>('/sites'),
  site: (siteId: string) => api<{ site: Site }>(`/sites/${siteId}`),
  suppressedSites: () => api<{ sites: Site[] }>('/sites/suppressed'),
  acceptSiteInvitation: (siteId: string) =>
    api<{ message?: string }>(`/site/${siteId}/invitation/accept`, { method: 'PATCH', bodySchema: EmptyObjectRequestSchema, body: body(EmptyObjectRequestSchema, {}, 'Accept site invitation') }),
  declineSiteInvitation: (siteId: string) =>
    api<{ message?: string }>(`/site/${siteId}/invitation/decline`, { method: 'PATCH', bodySchema: EmptyObjectRequestSchema, body: body(EmptyObjectRequestSchema, {}, 'Decline site invitation') }),
  suppressSiteInvitation: (siteId: string) =>
    api<{ message?: string }>(`/site/${siteId}/invitation/suppress`, { method: 'PATCH', bodySchema: EmptyObjectRequestSchema, body: body(EmptyObjectRequestSchema, {}, 'Suppress site invitation') }),
  createSite: (name: string) =>
    api<{ site: Site }>('/sites', { method: 'POST', bodySchema: NonEmptyNameRequestSchema, body: body(NonEmptyNameRequestSchema, { name }, 'Create site') }),
  updateSite: (siteId: string, input: { name?: string; visibility?: string; icon?: string; attributes?: Record<string, unknown> }) =>
    api<{ site: Site }>(`/sites/${siteId}`, { method: 'PATCH', bodySchema: SitePatchRequestSchema, body: body(SitePatchRequestSchema, input, 'Update site') }),
  createFolder: (siteId: string, name: string, folderId?: string) =>
    api<{ folder: { id: string; name: string } }>(`/sites/${siteId}/folders`, {
      method: 'POST',
      bodySchema: FolderCreateRequestSchema,
      body: body(FolderCreateRequestSchema, { name, ...(folderId ? { folderId } : {}) }, 'Create folder'),
    }),
  deleteContent: (siteId: string, contentId: string) =>
    api<void>(`/site/${siteId}/content/${contentId}`, { method: 'DELETE' }),
  updateContent: (siteId: string, contentId: string, input: { name: string }) =>
    api<{ content: { id: string; name: string } }>(`/site/${siteId}/content/${contentId}`, {
      method: 'PUT',
      bodySchema: NonEmptyNameRequestSchema,
      body: body(NonEmptyNameRequestSchema, input, 'Update content'),
    }),
  file: (siteId: string, fileId: string) =>
    api<{ file: FileItem }>(`/site/${siteId}/file/${fileId}`),
  fileToken: (siteId: string, fileId: string, purpose: 'view' | 'download') =>
    api<{ token: string; url: string; expiresAt: string }>(`/site/${siteId}/file/${fileId}/token?purpose=${encodeURIComponent(purpose)}`),
  uploadTarget: (input: { siteId: string; folderId?: string; fileName: string; contentType?: string; size?: number }) =>
    api<{ target: { method?: 'PUT' | 'POST'; url: string; headers?: Record<string, string>; fileId: string; fileKey: string; expiresAt?: string } }>('/files/upload-target', {
      method: 'POST',
      bodySchema: FileUploadTargetRequestSchema,
      body: body(FileUploadTargetRequestSchema, input, 'Create file upload target'),
    }),
  searchSite: (siteId: string, q: string) =>
    api<{ results?: FileItem[]; contents?: FileItem[] }>(`/site/${siteId}/search`, {
      method: 'POST',
      bodySchema: ContentSearchRequestSchema,
      body: body(ContentSearchRequestSchema, { q }, 'Search site'),
    }),
  searchAll: (q: string) =>
    api<{ results?: FileItem[]; contents?: FileItem[] }>('/search', {
      method: 'POST',
      bodySchema: ContentSearchRequestSchema,
      body: body(ContentSearchRequestSchema, { q }, 'Search all sites'),
    }),
  dashboard: (filter?: Partial<AnalyticsFilter>) => {
    const query = new URLSearchParams()
    if (filter?.sites?.length) filter.sites.forEach(siteId => query.append('sites', siteId))
    if (filter?.startDate) query.set('startDate', filter.startDate)
    if (filter?.endDate) query.set('endDate', filter.endDate)
    if (filter?.timeZone) query.set('timeZone', filter.timeZone)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return api<Record<string, unknown>>(`/analytics/dashboard${suffix}`)
  },
  mostAccessed: (filter: AnalyticsFilter) =>
    api<AnalyticsRowsResponse>('/analytics/most-accessed', {
      method: 'POST',
      bodySchema: AnalyticsFilterRequestSchema,
      body: body(AnalyticsFilterRequestSchema, filter, 'Most accessed analytics'),
    }),
  mostActive: (filter: AnalyticsFilter) =>
    api<AnalyticsRowsResponse>('/analytics/most-active', {
      method: 'POST',
      bodySchema: AnalyticsFilterRequestSchema,
      body: body(AnalyticsFilterRequestSchema, filter, 'Most active analytics'),
    }),
  contentActivity: (filter: AnalyticsFilter) =>
    api<AnalyticsRowsResponse>('/analytics/content-activity', {
      method: 'POST',
      bodySchema: AnalyticsFilterRequestSchema,
      body: body(AnalyticsFilterRequestSchema, filter, 'Content activity analytics'),
    }),
  usageTimes: (filter: AnalyticsFilter) =>
    api<AnalyticsRowsResponse>('/analytics/usage-times', {
      method: 'POST',
      bodySchema: AnalyticsFilterRequestSchema,
      body: body(AnalyticsFilterRequestSchema, filter, 'Usage times analytics'),
    }),
  monthlyActiveUsers: (filter?: Partial<AnalyticsFilter>) =>
    api<Record<string, unknown>>('/analytics/monthly-active-users', {
      method: 'POST',
      bodySchema: AnalyticsFilterRequestSchema,
      body: body(AnalyticsFilterRequestSchema, filter ?? {}, 'Monthly active users analytics'),
    }),
  accessKeys: () => api<{ accessKeys: AccessKey[] }>('/account/access-keys'),
  accessKeyTypes: () => api<{ keyTypes: Record<string, string[]> }>('/account/access-keys/types'),
  createAccessKey: (input?: { name?: string; description?: string; keyType?: string; scopes?: string[]; expiresIn?: number }) =>
    api<{ key: string; accessKey?: AccessKey }>('/account/access-keys', {
      method: 'POST',
      bodySchema: AccessKeyCreateRequestSchema,
      body: body(AccessKeyCreateRequestSchema, {
        name: input?.name ?? 'CE MCP Key',
        description: input?.description,
        keyType: input?.keyType ?? 'mcp',
        scopes: input?.scopes ?? ['mcp:read'],
        expiresIn: input?.expiresIn,
      }, 'Create access key'),
    }),
  revokeAccessKey: (keyId: string) =>
    api<{ message: string }>(`/account/access-keys/${keyId}`, { method: 'DELETE' }),
  health: () => api<HealthStatus>('/health'),
  sendNotification: (input: { to: string; subject: string; body: string }) =>
    api<{ message: string }>('/notifications/send', {
      method: 'POST',
      bodySchema: NotificationSendRequestSchema,
      body: body(NotificationSendRequestSchema, input, 'Send notification'),
    }),
  agents: () => api<{ agents: Agent[]; runtimeConfigured: boolean }>('/agents'),
  agent: (agentId: string) =>
    api<{ agent: Agent; runtimeConfigured: boolean }>(`/agents/${agentId}`),
  createAgent: (manifest: unknown) =>
    api<{ agent: Agent }>('/agents', {
      method: 'POST',
      bodySchema: AgentCreateRequestSchema,
      body: body(AgentCreateRequestSchema, { manifest }, 'Create agent'),
    }),
  updateAgent: (agentId: string, manifest: unknown) =>
    api<{ agent: Agent }>(`/agents/${agentId}`, {
      method: 'PATCH',
      bodySchema: AgentUpdateRequestSchema,
      body: body(AgentUpdateRequestSchema, { manifest }, 'Update agent'),
    }),
  deleteAgent: (agentId: string) => api<void>(`/agents/${agentId}`, { method: 'DELETE' }),
  agentRuns: (agentId?: string) =>
    api<{ runs: AgentRun[] }>(`/agent-runs${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`),
  agentRun: (runId: string) =>
    api<{ run: AgentRun }>(`/agent-runs/${encodeURIComponent(runId)}`),
  agentSchedules: (agentId: string) =>
    api<{ schedules: AgentSchedule[] }>(`/agents/${agentId}/schedules`),
  createAgentSchedule: (
    agentId: string,
    input: {
      definition: AgentScheduleDefinition
      variables: Array<{ key: string; value: unknown }>
      siteId?: string
      enabled: boolean
    },
  ) =>
    api<{ schedule: AgentSchedule }>(`/agents/${agentId}/schedules`, {
      method: 'POST',
      bodySchema: AgentScheduleCreateRequestSchema,
      body: body(AgentScheduleCreateRequestSchema, input, 'Create agent schedule'),
    }),
  updateAgentSchedule: (
    scheduleId: string,
    input: {
      definition: AgentScheduleDefinition
      variables: Array<{ key: string; value: unknown }>
      siteId?: string
      enabled: boolean
    },
  ) =>
    api<{ schedule: AgentSchedule }>(`/agent-schedules/${scheduleId}`, {
      method: 'PATCH',
      bodySchema: AgentScheduleUpdateRequestSchema,
      body: body(AgentScheduleUpdateRequestSchema, input, 'Update agent schedule'),
    }),
  deleteAgentSchedule: (scheduleId: string) =>
    api<void>(`/agent-schedules/${scheduleId}`, { method: 'DELETE' }),
}

export async function streamAgentRun(
  path: string,
  input: unknown,
  onMessage: (message: any) => void,
) {
  const payload = validateRequest(AgentRunCreateRequestSchema, input, 'Run agent')
  return streamAgentResponse(path, payload, onMessage)
}

export async function streamAgentResume(
  runId: string,
  onMessage: (message: any) => void,
) {
  const payload = validateRequest(EmptyObjectRequestSchema, {}, 'Resume agent')
  return streamAgentResponse(`/agent-runs/${encodeURIComponent(runId)}/resume`, payload, onMessage)
}

async function streamAgentResponse(
  path: string,
  payload: unknown,
  onMessage: (message: any) => void,
) {
  const response = await fetch(toApiPath(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const responseBody = await response.text()
    throw new Error(responseBody || response.statusText)
  }
  if (!response.body) throw new Error('The agent response did not include a stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  while (true) {
    const { value, done } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) onMessage(JSON.parse(line))
    if (done) break
  }
  if (pending.trim()) onMessage(JSON.parse(pending))
}
