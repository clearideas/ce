export interface AppModels {
  UserModel: any
  AccountModel: any
  SiteModel: any
  ContentModel: any
  UserGroupModel: any
  AccessKeyModel: any
  ActivityModel: any
}

export interface CeAppContext {
  auth: any
  models: AppModels
  providers: any
  search?: any
}
