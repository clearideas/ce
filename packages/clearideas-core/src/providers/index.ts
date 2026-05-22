export interface UploadTarget {
  method: 'PUT' | 'POST'
  url: string
  headers?: Record<string, string>
  fileId?: string
  fileKey: string
}

export type EmailAddress = string | string[]

export interface EmailSendInput {
  to: EmailAddress
  from?: string
  replyTo?: string
  subject: string
  text?: string
  html?: string
}

export interface EmailTemplateSendInput {
  to: EmailAddress
  from?: string
  replyTo?: string
  templateAlias: string
  templateModel: Record<string, unknown>
  subject?: string
}

export interface StorageProvider {
  createUploadTarget(input: { fileName: string; contentType?: string }): Promise<UploadTarget>
  writeObject(input: { key: string; body: Buffer; contentType?: string }): Promise<void>
  readObject(input: { key: string }): Promise<Buffer>
  deleteObjects(input: { keys: string[] }): Promise<void>
  getDownloadUrl?(input: { key: string; expiresInSeconds?: number }): Promise<string>
}

export interface EmailProvider {
  sendTemplate(input: EmailTemplateSendInput): Promise<void>
  send(input: EmailSendInput): Promise<void>
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
}

export interface JobsProvider {
  enqueue(name: string, payload: Record<string, unknown>): Promise<void>
}

export interface CoreProviders {
  storage: StorageProvider
  email: EmailProvider
  cache?: CacheProvider
  jobs?: JobsProvider
}

let providers: CoreProviders | null = null

export function registerCoreProviders(input: CoreProviders): void {
  providers = input
}

export function getCoreProviders(): CoreProviders {
  if (!providers) {
    throw new Error('Core providers are not registered.')
  }
  return providers
}
