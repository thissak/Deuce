import { z } from 'zod'

export const AttachmentDtoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number().int(),
  contentType: z.string(),
})
export type AttachmentDto = z.infer<typeof AttachmentDtoSchema>

export const SharedFileSchema = AttachmentDtoSchema.extend({
  messageId: z.string(),
  createdAt: z.string(),
})
export type SharedFile = z.infer<typeof SharedFileSchema>
