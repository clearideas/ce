import { memberUserId } from './site-membership.js'
import { coreSiteRoles, coreSiteVisibility } from './config.js'
import {
  applySerializerOptions,
  extendSerialized,
  serializeId,
  type SerializerExtension,
  type SerializerOptions,
} from './serializer.js'

export type SerializedSite = Record<string, any>

export type SiteSerializationContext = {
  site: any
  folders: any[]
  rootFiles: any[]
  currentUserRole: string
  latestUpdatedAt: unknown
  totalActiveSize: number
}

export type SerializeSiteOptions = SerializerOptions & {
  ownerRoles?: readonly string[]
  includeProjectedContent?: boolean
  serializeMember?: (member: any, context: SiteSerializationContext) => Record<string, unknown>
  serializeFile?: (file: any, context: SiteSerializationContext & { folder?: any }) => Record<string, unknown>
  serializeFolder?: (folder: any, context: SiteSerializationContext) => Record<string, unknown>
  extendAttributes?: (context: SiteSerializationContext) => Record<string, unknown>
  extendSite?: SerializerExtension<any, SiteSerializationContext, SerializedSite>
}

export function serializeSite(site: any, options: SerializeSiteOptions = {}) {
  const context = buildSiteSerializationContext(site)
  return serializeSiteFromContext(context, options)
}

export function buildSiteSerializationContext(site: any): SiteSerializationContext {
  const folders = site.folders ?? []
  const rootFiles = site.files ?? []
  const currentUserRole = String(site.currentUserRole ?? '')
  const latestUpdatedAt =
    site.attributes?.latestUpdatedAt ??
    rootFiles
      .concat(folders.flatMap((folder: any) => folder.files ?? []))
      .map((file: any) => file.uploadedAt)
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0] ??
    site.updatedAt ??
    site.createdAt
  const totalActiveSize = rootFiles.reduce((total: number, file: any) => total + (file.size ?? 0), 0) + folders.reduce(
    (siteTotal: number, folder: any) =>
      siteTotal +
      (folder.files ?? []).reduce((folderTotal: number, file: any) => folderTotal + (file.size ?? 0), 0),
    0,
  )
  return {
    site,
    folders,
    rootFiles,
    currentUserRole,
    latestUpdatedAt,
    totalActiveSize,
  }
}

function serializeSiteFromContext(
  context: SiteSerializationContext,
  options: SerializeSiteOptions,
) {
  const {
    site,
    folders,
    rootFiles,
    currentUserRole,
    latestUpdatedAt,
    totalActiveSize,
  } = context
  const ownerRoles = options.ownerRoles ?? coreSiteRoles.adminRoles
  const includeProjectedContent = options.includeProjectedContent ?? true
  const serialized: SerializedSite = {
    id: serializeId(site._id ?? site.id),
    name: site.name,
    icon: site.icon,
    visibility: site.visibility ?? coreSiteVisibility.private,
    owned: site.owned ?? ownerRoles.includes(currentUserRole),
    currentUserRole: site.currentUserRole,
    members: (site.members ?? []).map((member: any) =>
      options.serializeMember?.(member, context) ?? {
        userId: memberUserId(member),
        role: member.role,
      },
    ),
    attributes: {
      ...(site.attributes ?? {}),
      latestUpdatedAt,
      totalActiveSize,
      ...(options.extendAttributes?.(context) ?? {}),
    },
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }

  if (!includeProjectedContent) {
    return applySerializerOptions(extendSerialized(site, serialized, context, options.extendSite), options)
  }

  const projected: SerializedSite = {
    ...serialized,
    files: rootFiles.map((x: any) => ({
      id: serializeId(x._id ?? x.id),
      name: x.name,
      key: x.key,
      size: x.size,
      contentType: x.contentType,
      extension: x.extension,
      extractionStatus: x.extractionStatus,
      parentId: x.parentId ? serializeId(x.parentId) : undefined,
      uploadedAt: x.uploadedAt,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt ?? x.uploadedAt,
      ...(options.serializeFile?.(x, context) ?? {}),
    })),
    folders: folders.map((f: any) => ({
      id: serializeId(f._id ?? f.id),
      name: f.name,
      parentId: f.parentId ? serializeId(f.parentId) : undefined,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      ...(options.serializeFolder?.(f, context) ?? {}),
      files: (f.files ?? []).map((x: any) => ({
        id: serializeId(x._id ?? x.id),
        name: x.name,
        key: x.key,
        size: x.size,
        contentType: x.contentType,
        extension: x.extension,
        extractionStatus: x.extractionStatus,
        parentId: x.parentId ? serializeId(x.parentId) : serializeId(f._id ?? f.id),
        uploadedAt: x.uploadedAt,
        createdAt: x.createdAt,
        updatedAt: x.updatedAt ?? x.uploadedAt,
        ...(options.serializeFile?.(x, { ...context, folder: f }) ?? {}),
      })),
    })),
  }

  return applySerializerOptions(extendSerialized(site, projected, context, options.extendSite), options)
}
