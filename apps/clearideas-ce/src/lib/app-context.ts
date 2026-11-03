export interface AppModels {
  UserModel: any
  AccountModel: any
  SiteModel: any
  ContentModel: any
  UserGroupModel: any
  AccessKeyModel: any
  ActivityModel: any
  SessionModel: any
  AgentModel: any
  AgentRunModel: any
  AgentScheduleModel: any
  AgentTaskModel: any
}

import type { SiteSearchIndexManager } from '../services/search-index.js'

export interface CeAppContext {
  auth: any
  models: AppModels
  providers: any
  search?: SiteSearchIndexManager
  agentHost?: any
}
