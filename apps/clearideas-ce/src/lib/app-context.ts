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

export interface CeAppContext {
  auth: any
  models: AppModels
  providers: any
  search?: any
  agentHost?: any
}
