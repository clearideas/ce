import { z } from 'zod'

export const EmptyObjectRequestSchema = z.strictObject({})

export const BinaryUploadBodyRequestSchema = z.custom<Uint8Array | ArrayBuffer | Blob>(
  value =>
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    (typeof Blob !== 'undefined' && value instanceof Blob),
  { error: 'Upload body is required' },
)

export type EmptyObjectRequest = z.infer<typeof EmptyObjectRequestSchema>
export type BinaryUploadBodyRequest = z.infer<typeof BinaryUploadBodyRequestSchema>
