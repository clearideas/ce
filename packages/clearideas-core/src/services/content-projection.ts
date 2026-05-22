import {
  applySerializerOptions,
  extendSerialized,
  serializeId,
  type SerializerExtension,
  type SerializerOptions,
} from './serializer.js'

export function withProjectedContent(site: any, contents: any[]) {
  const folders = contents.filter(content => content.kind === 'Folder')
  const files = contents.filter(content => content.kind === 'File')
  const folderById = new Map(folders.map(folder => [String(folder._id), folder]))
  return {
    ...site,
    files: files
      .filter(file => String(file.parentType) === 'Site')
      .map(file => serializeFile(file, { site, folder: null, projection: 'site' })),
    folders: folders.map(folder => ({
      ...serializeFolder(folder, { site, projection: 'site' }),
      files: files
        .filter(file => String(file.parent) === String(folder._id))
        .map(file => serializeFile(file, { site, folder: folderById.get(String(file.parent)) ?? folder, projection: 'site' })),
    })),
  }
}

export type SerializedFile = Record<string, any>
export type SerializedFolder = Record<string, any>

export type ContentSerializationContext = {
  site?: any
  folder?: any | null
  projection?: 'site' | 'mcp' | 'default'
}

export type SerializeFileOptions = ContentSerializationContext & SerializerOptions & {
  extendFile?: SerializerExtension<any, ContentSerializationContext, SerializedFile>
}

export type SerializeFolderOptions = ContentSerializationContext & SerializerOptions & {
  extendFolder?: SerializerExtension<any, ContentSerializationContext, SerializedFolder>
}

export function serializeFile(file: any, options: SerializeFileOptions = {}) {
  const site = options.site
  const folder = options.folder
  const isMcp = options.projection === 'mcp'
  const isSiteProjection = options.projection === 'site'
  const serialized: SerializedFile = isMcp
    ? {
        id: serializeId(file._id ?? file.id),
        name: String(file.name ?? ''),
        kind: 'file',
        siteId: site ? serializeId(site._id ?? site.id) : serializeId(file.siteId ?? file.site),
        siteName: site ? String(site.name ?? '') : String(file.siteName ?? ''),
        folderId: folder ? serializeId(folder._id ?? folder.id) : serializeId(file.folderId),
        folderName: folder ? String(folder.name ?? '') : String(file.folderName ?? ''),
        parentId: folder ? serializeId(folder._id ?? folder.id) : serializeId(file.parentId),
        size: file.size ?? null,
        contentType: file.contentType ?? null,
        extractionStatus: file.extractionStatus ?? null,
        extractedTextUpdatedAt: file.extractedTextUpdatedAt ?? null,
        updatedAt: file.updatedAt ?? file.uploadedAt ?? null,
      }
    : {
        id: serializeId(file._id ?? file.id),
        name: file.name,
        site: site ? serializeId(site._id ?? site.id) : serializeId(file.site ?? file.siteId),
        siteId: site ? serializeId(site._id ?? site.id) : serializeId(file.siteId ?? file.site),
        siteName: site?.name ?? file.siteName,
        parent: folder ? serializeId(folder._id ?? folder.id) : site ? serializeId(site._id ?? site.id) : serializeId(file.parent ?? file.parentId),
        parentName: folder ? folder.name : site?.name ?? file.parentName,
        parentType: folder ? 'Folder' : site ? 'Site' : file.parentType,
        folderId: folder ? serializeId(folder._id ?? folder.id) : serializeId(file.folderId),
        folderName: folder ? String(folder.name ?? '') : String(file.folderName ?? ''),
        kind: 'file',
        ...(isSiteProjection
          ? {
              key: file.key,
              size: file.size,
              contentType: file.contentType,
              extension: file.extension,
              extractionStatus: file.extractionStatus,
              extractedTextUpdatedAt: file.extractedTextUpdatedAt,
            }
          : {}),
        uploadedAt: file.uploadedAt,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt ?? file.uploadedAt,
      }
  return applySerializerOptions(extendSerialized(file, serialized, options, options.extendFile), options)
}

export function serializeFolder(folder: any, options: SerializeFolderOptions = {}) {
  const site = options.site
  const isMcp = options.projection === 'mcp'
  const serialized: SerializedFolder = isMcp
    ? {
        id: serializeId(folder._id ?? folder.id),
        name: String(folder.name ?? ''),
        kind: 'folder',
        siteId: site ? serializeId(site._id ?? site.id) : serializeId(folder.siteId ?? folder.site),
        siteName: site ? String(site.name ?? '') : String(folder.siteName ?? ''),
        parentId: folder.parentId ? String(folder.parentId) : '',
        size: null,
        contentType: null,
        fileCount: (folder.files ?? []).length,
        updatedAt: folder.updatedAt ?? folder.createdAt ?? null,
      }
    : {
        id: serializeId(folder._id ?? folder.id),
        _id: folder._id,
        name: folder.name,
        parentId: folder.parentId ?? (folder.parentType === 'Content' ? String(folder.parent) : undefined),
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      }
  return applySerializerOptions(extendSerialized(folder, serialized, options, options.extendFolder), options)
}

export function toProjectedFile(file: any, site: any, folder: any) {
  return serializeFile(file, { site, folder, projection: 'site' })
}

export function toSearchFile(file: any) {
  return {
    id: String(file.id ?? file._id),
    siteId: String(file.siteId ?? file.site),
    siteName: file.siteName,
    folderId: file.folderId ?? '',
    folderName: file.folderName ?? '',
    name: file.name,
    key: file.key,
    contentType: file.contentType,
    size: file.size,
    uploadedAt: file.uploadedAt,
    updatedAt: file.updatedAt ?? file.uploadedAt,
    extractedText: file.extractedText,
    extractedTextKey: file.extractedTextKey,
    extractionStatus: file.extractionStatus,
  }
}
