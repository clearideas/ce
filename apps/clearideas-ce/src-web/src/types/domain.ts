export type FileItem = {
  id: string
  name: string
  key: string
  site?: string
  siteId?: string
  siteName?: string
  parent?: string
  parentName?: string
  parentType?: string
  size?: number
  contentType?: string
  folderId?: string
  folderName?: string
  uploadedAt?: string
  updatedAt?: string
  kind?: 'file'
  attributes?: Record<string, unknown>
  tags?: string[]
  viewUrl?: string
  downloadUrl?: string
}

/**
 * A row in a site's content list/tiles: either a file (with its FileItem fields) or a folder,
 * normalised by the content store (`contents`) so the views can treat them uniformly.
 */
export type ContentItem = Partial<Omit<FileItem, 'id' | 'name' | 'kind' | 'attributes' | 'tags' | 'site'>> & {
  id: string
  name: string
  /** Owning site id. */
  site: string
  kind: 'file' | 'folder'
  rank?: number
  updatedAt?: string
  attributes: Record<string, unknown> & { icon?: string }
  tags: string[]
}

/** Breadcrumb ancestor of the current content (folder or file). */
export type ContentAncestor = { id: string; name: string; kind: 'folder' | 'file' }

export type Folder = {
  id: string
  name: string
  parentId?: string
  createdAt?: string
  updatedAt?: string
  files: FileItem[]
}

export type SiteTab = 'content' | 'users' | 'settings' | 'ai'

export type Site = {
  id: string
  name: string
  icon?: string
  visibility?: 'private' | 'public'
  owned?: boolean
  currentUserRole?: string
  files?: FileItem[]
  folders: Folder[]
  members?: Array<{ userId?: string; role?: string }>
  tags?: string[]
  attributes?: Record<string, unknown> & {
    latestUpdatedAt?: string
    totalActiveSize?: number
    media?: Record<string, { dataUrl?: string; bucket?: string } | null>
    notifications?: boolean
    ai?: { chatEnabled?: boolean; mcpEnabled?: boolean }
    mcp?: { enabled?: boolean }
    pdf?: { printEnabled?: boolean; printRoles?: string[] }
  }
  createdAt?: string
  updatedAt?: string
}

export type Session = {
  user: {
    id: string
    email: string
    name: string
  }
}

/**
 * A Better Auth session row (`GET /api/auth/list-sessions`). Dates arrive as ISO strings.
 * `token` identifies the session for `revoke-session`; treat it like a secret (never render it).
 */
export type AuthSession = {
  id: string
  token: string
  userId?: string
  createdAt: string
  updatedAt?: string
  expiresAt: string
  ipAddress?: string | null
  userAgent?: string | null
}

export type Account = {
  id: string
  name: string
  attributes?: {
    search?: {
      fullTextSearchEnabled?: boolean
      ocrEnabled?: boolean
    }
  }
}

export type User = {
  id: string
  email: string
  displayName?: string
  name?: string
  roles?: string[]
  status?: string
  lastActive?: string
  sites?: Array<{ siteId: string; name: string; role: string; expiresAt?: string | null }>
  attributes?: {
    timeZone?: string
    notifications?: NotificationSettings
    sites?: {
      autoAcceptInvites?: boolean
      favourites?: string[]
      suppressedSites?: string[]
      suppressNotifications?: string[]
    }
    /** UI preferences (see stores/preferences.store.ts). */
    ui?: Record<string, unknown>
  }
}

export type UserGroup = {
  id: string
  name: string
  users?: string[]
  members?: User[]
  attributes?: Record<string, unknown>
  media?: Record<string, unknown>
  icon?: string
}

export type NotificationAction =
  | 'uploaded'
  | 'deleted'
  | 'created'
  | 'made-public'
  | 'made-private'
  | 'added-user'
  | 'removed-user'
  | 'sent-invitation-email'
  | 'accepted-invitation'
  | 'requested-export'
  | 'exported'
  | 'unzipped'

export type NotificationSettings = {
  frequency: 'immediate' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never'
  hours: [string, string]
  days: string[]
  daysOfMonth?: number[]
  daysOfMonthExpression?: string[]
  subscribedActions?: NotificationAction[]
  subscribedAdminActions?: NotificationAction[]
}

export type AccessKey = {
  id: string
  name: string
  description?: string
  keyType: string
  scopes: string[]
  prefix?: string
  keyId?: string
  isActive?: boolean
  createdAt?: string
  expiresAt?: string | null
  lastUsedAt?: string | null
}

export type AgentManifest = {
  schemaVersion: '1.0'
  id?: string
  name: string
  description?: string
  model?: { ref: 'default' }
  variables?: Array<{
    key: string
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'json'
    value?: unknown
    requiresOverride?: boolean
    description?: string
  }>
  steps: Array<Record<string, unknown> & { id: string; type: 'prompt' }>
  limits?: Record<string, number>
  metadata?: Record<string, unknown>
}

/** NDJSON messages streamed by the agent run/resume endpoints. */
export type AgentStreamMessage =
  | { kind: 'event'; event: AgentStreamEvent }
  | { kind: 'result'; result: { output?: unknown } }
  | { kind: 'error'; error: string }

export type AgentStreamEvent = Record<string, unknown> & { type?: string }

export type Agent = {
  id: string
  name: string
  description: string
  manifest: AgentManifest
  revision: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AgentRun = {
  runId: string
  agentId: string
  agentRevision: number
  siteId?: string | null
  source: 'manual' | 'scheduled'
  scheduleId?: string | null
  status: 'created' | 'running' | 'suspended' | 'completed' | 'failed' | 'cancelled'
  output?: unknown
  transcript?: Array<Record<string, unknown>>
  usage?: Record<string, number>
  error?: { message?: string }
  createdAt: string
  updatedAt: string
}

export type AgentScheduleDefinition =
  | { kind: 'once'; runAt: string; timeZone: string }
  | { kind: 'daily'; time: string; timeZone: string }
  | { kind: 'weekly'; time: string; timeZone: string; daysOfWeek: number[] }
  | { kind: 'monthly'; time: string; timeZone: string; daysOfMonth: number[] }

export type AgentSchedule = {
  id: string
  agentId: string
  definition: AgentScheduleDefinition
  variables: Array<{ key: string; value: unknown }>
  siteId?: string | null
  enabled: boolean
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

export type HealthStatus = {
  status: string
  app: string
  db: string
  date: string
}

export type NavKey = 'sites' | 'ask' | 'users' | 'agents' | 'analytics' | 'settings'

/** A file an answer is based on (`data-sources` part of an assistant message). */
export type ChatSource = {
  contentId: string
  siteId: string
  siteName: string
  name: string
  contentType: string | null
}

/** A stored conversation (Ask and Site AI). `siteId` set: a Site AI conversation about that site. */
export type ChatConversationSummary = {
  id: string
  title: string
  siteId: string | null
  createdAt: string
  updatedAt: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  sources: ChatSource[]
  createdAt: string
}

export type ChatConversation = ChatConversationSummary & { messages: ChatMessage[] }

/** Sites an all-sites conversation uses (readable, AI chat on). */
export type ChatScopeSite = { id: string; name: string }
