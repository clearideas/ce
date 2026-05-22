import { objectIdString, optionalTrimmedString, requiredTrimmedString, z } from './primitives.js'

export const FileUploadTargetRequestSchema = z
  .strictObject({
    siteId: objectIdString,
    folderId: objectIdString.optional(),
    fileName: requiredTrimmedString('fileName'),
    contentType: optionalTrimmedString(),
    size: z.coerce.number().nonnegative().optional(),
  })
  .transform(value => ({
    siteId: value.siteId,
    ...(value.folderId ? { folderId: value.folderId } : {}),
    fileName: value.fileName,
    ...(value.contentType ? { contentType: value.contentType } : {}),
    ...(value.size != null && Number.isFinite(value.size) ? { size: value.size } : {}),
  }))

export type FileUploadTargetRequest = z.infer<typeof FileUploadTargetRequestSchema>
