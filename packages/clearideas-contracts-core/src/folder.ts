import { MAX_NAME_LENGTH, objectIdString, requiredTrimmedString, z } from './primitives.js'

export const NonEmptyNameRequestSchema = z
  .strictObject({
    name: requiredTrimmedString('name', MAX_NAME_LENGTH),
    folderId: objectIdString.optional(),
  })
  .transform(value => ({
    name: value.name,
    ...(value.folderId ? { folderId: value.folderId } : {}),
  }))

export type NonEmptyNameRequest = z.infer<typeof NonEmptyNameRequestSchema>

export const FolderCreateRequestSchema = NonEmptyNameRequestSchema
export type FolderCreateRequest = z.infer<typeof FolderCreateRequestSchema>
