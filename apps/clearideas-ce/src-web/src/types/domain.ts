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
  attributes?: Record<string, any>
  tags?: string[]
  viewUrl?: string
  downloadUrl?: string
}

export type Folder = {
  id: string
  name: string
  parentId?: string
  createdAt?: string
  updatedAt?: string
  files: FileItem[]
}

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
  attributes?: Record<string, any> & {
    latestUpdatedAt?: string
    totalActiveSize?: number
    media?: Record<string, { dataUrl?: string; bucket?: string } | null>
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
  }
}

export type UserGroup = {
  id: string
  name: string
  users?: string[]
  members?: User[]
  attributes?: Record<string, any>
  media?: Record<string, any>
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

export type NavKey = 'sites' | 'users' | 'analytics' | 'settings'
